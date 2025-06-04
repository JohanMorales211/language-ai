import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subject, Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, switchMap, tap, catchError } from 'rxjs/operators';

import { HeaderComponent } from '../../components/header/header.component';
import { FooterComponent } from '../../components/footer/footer.component';

interface DictionaryEntry {
  alternative_in_target_lang: string;
  example_original_lang?: string;
  example_target_lang?: string;
}

interface TranslationApiResponse {
  detected_language_code: string;
  translation: string;
  dictionary_entries?: DictionaryEntry[];
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    HeaderComponent,
    FooterComponent
  ]
})
export class HomeComponent implements OnInit, OnDestroy {
  targetLanguage: string = 'en';
  inputText: string = '';
  outputText: string = '';
  detectedSourceLanguageCode: string = '';
  detectedSourceLanguageDisplay: string = '';
  dictionaryEntries: DictionaryEntry[] = [];

  availableTargetLanguages: { code: string, name: string }[] = [];
  private allTargetLanguages: { code: string, name: string }[] = [
    { code: 'en', name: 'Inglés' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Francés' },
    { code: 'pt', name: 'Portugués' }
  ];

  isLoading: boolean = false;
  private isManualTargetSelection: boolean = false;
  private isRetranslatingForDictionary: boolean = false;

  private inputTextChange$ = new Subject<string>();
  private translationSubscription!: Subscription;

  private readonly CEREBRAS_API_KEY = 'csk-e3w55h2rwv5w664x3vecn9v4j4554hyvhkdwykcdwvrv82pf';
  private readonly CEREBRAS_API_BASE_URL = 'https://api.cerebras.ai/v1';
  private readonly CEREBRAS_MODEL_ID = 'llama-4-scout-17b-16e-instruct';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.updateAvailableTargetLanguages();

    this.translationSubscription = this.inputTextChange$.pipe(
      debounceTime(1000),
      distinctUntilChanged(),
      tap(text => {
        if (text.trim().length === 0) {
          this.clearOutputs();
          this.isLoading = false;
        }
      }),
      filter(text => text.trim().length > 0 && !this.isRetranslatingForDictionary),
      tap(() => {
        this.isLoading = true;
        this.outputText = '';
        this.dictionaryEntries = [];
        this.detectedSourceLanguageDisplay = 'Detectando...';
      }),
      switchMap(text => this.callTranslationAPI(text, false))
    ).subscribe();
  }

  ngOnDestroy(): void {
    if (this.translationSubscription) {
      this.translationSubscription.unsubscribe();
    }
  }

  getLanguageName(code: string): string {
    if (!code) return '';
    const lang = this.allTargetLanguages.find(l => l.code === code.toLowerCase());
    if (lang) return lang.name;
    if (code.toLowerCase() === 'detect') return 'Detectar Idioma';
    return code.toUpperCase();
  }

  private updateAvailableTargetLanguages(): boolean {
    const previousTargetLanguage = this.targetLanguage;

    if (this.detectedSourceLanguageCode) {
      this.availableTargetLanguages = this.allTargetLanguages.filter(
        lang => lang.code !== this.detectedSourceLanguageCode
      );
    } else {
      this.availableTargetLanguages = [...this.allTargetLanguages];
    }

    let targetLanguageChanged = false;

    if (this.detectedSourceLanguageCode && this.targetLanguage === this.detectedSourceLanguageCode) {
      if (this.availableTargetLanguages.length > 0) {
        this.targetLanguage = this.availableTargetLanguages[0].code;
        targetLanguageChanged = (previousTargetLanguage !== this.targetLanguage);
      } else {
        this.targetLanguage = '';
        targetLanguageChanged = (previousTargetLanguage !== this.targetLanguage);
      }
    } else if (!this.availableTargetLanguages.find(lang => lang.code === this.targetLanguage) && this.availableTargetLanguages.length > 0) {
      this.targetLanguage = this.availableTargetLanguages[0].code;
      targetLanguageChanged = (previousTargetLanguage !== this.targetLanguage);
    } else if (this.availableTargetLanguages.length > 0 && !this.targetLanguage) {
      this.targetLanguage = this.availableTargetLanguages[0].code;
      targetLanguageChanged = (previousTargetLanguage !== this.targetLanguage);
    }
    return targetLanguageChanged;
  }

  clearOutputs(): void {
    this.outputText = '';
    this.dictionaryEntries = [];
    this.detectedSourceLanguageDisplay = this.inputText.trim().length > 0 ? 'Escribe para detectar idioma...' : '';
    this.detectedSourceLanguageCode = '';
    this.updateAvailableTargetLanguages();
  }

  onInputTextChanged(): void {
    this.isManualTargetSelection = false;
    this.isRetranslatingForDictionary = false;
    this.inputTextChange$.next(this.inputText);
  }

  onTargetLanguageChanged(): void {
    this.isManualTargetSelection = true;
    if (this.inputText.trim().length > 0) {
      this.isLoading = true;
      this.outputText = '';
      this.dictionaryEntries = [];
      const currentDetectedDisplay = this.detectedSourceLanguageCode
                                     ? `Detectado: ${this.getLanguageName(this.detectedSourceLanguageCode)}`
                                     : 'Traduciendo con nuevo destino...';
      this.detectedSourceLanguageDisplay = currentDetectedDisplay;
      this.callTranslationAPI(this.inputText, true).subscribe();
    }
  }

  private callTranslationAPI(text: string, isForcedCall: boolean) {
    if (!this.targetLanguage && this.availableTargetLanguages.length > 0) {
        this.targetLanguage = this.availableTargetLanguages[0].code;
    } else if (!this.targetLanguage && this.availableTargetLanguages.length === 0) {
        this.isLoading = false;
        this.outputText = 'Error: No hay idioma de destino disponible.';
        this.dictionaryEntries = [];
        this.handleApiError('No target language available.');
        return of(null);
    }

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.CEREBRAS_API_KEY}`,
      'Content-Type': 'application/json'
    });

    const targetLanguageName = this.getLanguageName(this.targetLanguage);
    console.log(`callTranslationAPI: targetLang=${this.targetLanguage} (${targetLanguageName}), isForcedCall=${isForcedCall}, isManual=${this.isManualTargetSelection}`);

    const systemPrompt = `Eres un traductor experto y un creador de contenido de diccionario muy detallado.
Para el texto proporcionado por el usuario:
1.  Detecta el idioma del texto original. Llama a este "Idioma Detectado".
2.  Proporciona la traducción más directa y común del texto original al idioma "${targetLanguageName}". Llama a este "Idioma de Destino". Esta es la "Traducción Principal".
3.  Crea una entrada de diccionario para esta "Traducción Principal":
    a.  En el campo "alternative_in_target_lang" de esta primera entrada, coloca la "Traducción Principal".
    b.  Proporciona una frase de ejemplo corta y clara en el "Idioma Detectado" que use el texto original.
    c.  Proporciona la traducción de esa frase de ejemplo al "Idioma de Destino" ("${targetLanguageName}"), asegurándote de que esta traducción utilice la "Traducción Principal".
4.  Adicionalmente, identifica 1-2 alternativas o sinónimos comunes para el SIGNIFICADO del TEXTO ORIGINAL, pero expresados también en el "Idioma de Destino" ("${targetLanguageName}").
5.  Para cada una de estas ALTERNATIVAS:
    a.  En el campo "alternative_in_target_lang" de estas entradas subsecuentes, coloca la alternativa.
    b.  Proporciona una frase de ejemplo corta y clara en el "Idioma Detectado" que use el texto original o una frase con significado muy similar.
    c.  Proporciona la traducción de esa frase de ejemplo al "Idioma de Destino" ("${targetLanguageName}"), asegurándote de que esta traducción utilice la ALTERNATIVA específica que estás ejemplificando.
    *La estructura de ejemplo bilingüe (frase original en "Idioma Detectado", y su traducción al "Idioma de Destino" usando la alternativa/traducción principal) debe mantenerse consistentemente para TODAS las direcciones de traducción.*
6.  Devuelve ÚNICAMENTE un objeto JSON válido con las siguientes claves:
    *   "detected_language_code": El código ISO 639-1 del "Idioma Detectado".
    *   "translation": La "Traducción Principal" del texto original al "Idioma de Destino". (Esta DEBE COINCIDIR con el valor de "alternative_in_target_lang" de la primera entrada en "dictionary_entries").
    *   "dictionary_entries": Un array de objetos. La PRIMERA entrada DEBE ser para la "Traducción Principal". Cada objeto debe tener: "alternative_in_target_lang", "example_original_lang", "example_target_lang".

Ejemplo si el usuario escribe "sin embargo" (Detectado: Español) y targetLanguage es Inglés:
{
  "detected_language_code": "es",
  "translation": "however",
  "dictionary_entries": [
    {"alternative_in_target_lang": "however", "example_original_lang": "Es bueno; sin embargo, caro.", "example_target_lang": "It's good; however, expensive."},
    {"alternative_in_target_lang": "nevertheless", "example_original_lang": "No estudió; sin embargo, aprobó.", "example_target_lang": "He didn't study; nevertheless, he passed."}
  ]
}
Ejemplo si el usuario escribe "actually" (Detectado: Inglés) y targetLanguage es Español:
{
  "detected_language_code": "en",
  "translation": "en realidad",
  "dictionary_entries": [
    {"alternative_in_target_lang": "en realidad", "example_original_lang": "Actually, I prefer tea.", "example_target_lang": "En realidad, prefiero el té."},
    {"alternative_in_target_lang": "de hecho", "example_original_lang": "It's not blue, actually, it's green.", "example_target_lang": "No es azul, de hecho, verde."}
  ]
}
Asegúrate de que el JSON sea estrictamente válido. No incluyas texto fuera del JSON.`;

    const apiUrl = `${this.CEREBRAS_API_BASE_URL}/chat/completions`;
    const body = { model: this.CEREBRAS_MODEL_ID, messages: [{ role: "system", content: systemPrompt },{ role: "user", content: text }], temperature: 0.35, max_completion_tokens: 2800, top_p: 1, stream: false };

    return this.http.post<any>(apiUrl, body, { headers }).pipe(
      tap({
        next: (response) => {
          this.isLoading = false;
          if (this.isRetranslatingForDictionary && !isForcedCall) {
            this.isRetranslatingForDictionary = false;
          }
          try {
            let responseContent = response?.choices?.[0]?.message?.content || '{}';
            const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
            if (jsonMatch && jsonMatch[0]) { responseContent = jsonMatch[0]; }
            const parsedResponse: TranslationApiResponse = JSON.parse(responseContent);

            if (parsedResponse && parsedResponse.translation && parsedResponse.detected_language_code) {
              this.outputText = parsedResponse.translation;
              this.dictionaryEntries = parsedResponse.dictionary_entries || [];
              const previousDetectedCode = this.detectedSourceLanguageCode;
              this.detectedSourceLanguageCode = parsedResponse.detected_language_code.toLowerCase();
              this.detectedSourceLanguageDisplay = `Detectado: ${this.getLanguageName(this.detectedSourceLanguageCode)}`;

              const targetLangBeforeAutoChange = this.targetLanguage;
              let autoTargetChanged = false;

              if (!this.isManualTargetSelection) {
                let newTargetLang = this.targetLanguage;
                if (this.detectedSourceLanguageCode === 'es' && this.targetLanguage !== 'en') {
                  if (this.allTargetLanguages.find(l => l.code === 'en' && l.code !== this.detectedSourceLanguageCode)) newTargetLang = 'en';
                } else if (this.detectedSourceLanguageCode !== 'es' && this.targetLanguage !== 'es') {
                  if (this.allTargetLanguages.find(l => l.code === 'es' && l.code !== this.detectedSourceLanguageCode)) newTargetLang = 'es';
                }
                if (newTargetLang === this.targetLanguage && newTargetLang === this.detectedSourceLanguageCode) {
                    const fallback = this.allTargetLanguages.find(l => l.code !== this.detectedSourceLanguageCode);
                    if (fallback) newTargetLang = fallback.code;
                }

                if (this.targetLanguage !== newTargetLang && this.allTargetLanguages.find(l => l.code === newTargetLang && l.code !== this.detectedSourceLanguageCode)) {
                  this.targetLanguage = newTargetLang;
                  autoTargetChanged = true;
                }
              }

              const listActuallyChangedTarget = this.updateAvailableTargetLanguages();

              if ((autoTargetChanged || listActuallyChangedTarget) && !isForcedCall && !this.isRetranslatingForDictionary && this.inputText.trim().length > 0) {
                console.log('Target language was auto-adjusted. Re-calling API to update dictionary examples for new target:', this.targetLanguage);
                this.isRetranslatingForDictionary = true;
                this.isLoading = true;
                this.callTranslationAPI(this.inputText, true).subscribe(() => {
                });
                return;
              }


            } else {
              this.handleApiError('Respuesta JSON no válida o incompleta.', parsedResponse);
            }
          } catch (e) {
            this.handleApiError('Error al procesar respuesta API (JSON).', response?.choices?.[0]?.message?.content, e);
          }
        },
        error: (error) => { this.handleApiError('Error en llamada API.', error); }
      }),
      catchError(error => {
        this.handleApiError('Error HTTP en la llamada a la API.', error);
        return of(null);
      })
    );
  }

  private handleApiError(message: string, errorData?: any, parseError?: any) {
    this.isLoading = false;
    this.outputText = message;
    this.detectedSourceLanguageDisplay = 'Error';
    this.dictionaryEntries = [];
    console.error(message, 'Datos del error:', errorData, 'Error de parseo:', parseError);
  }
}