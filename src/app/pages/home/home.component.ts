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
Tu tarea PRIMORDIAL e INICIAL es traducir el TEXTO COMPLETO proporcionado por el usuario.

Sigue estos pasos estrictamente:
1.  Detecta el idioma del texto original ingresado por el usuario. Llama a este "Idioma Detectado".
2.  **Traducción Principal (Campo "translation")**: Traduce la TOTALIDAD del texto original del usuario al idioma "${targetLanguageName}". Esta traducción debe ser completa y precisa, reflejando el significado completo de la frase o texto de entrada. NO abrevies, NO resumas, y NO traduzcas solo la primera palabra o una parte para este campo. El campo "translation" en el JSON de salida DEBE contener esta traducción completa.
3.  **Entradas de Diccionario (Campo "dictionary_entries")**:
    a.  La PRIMERA entrada en "dictionary_entries" debe tener su campo "alternative_in_target_lang" EXACTAMENTE IGUAL a la "Traducción Principal" (la traducción completa del paso 2).
    b.  Para esta primera entrada de diccionario:
        i.  "example_original_lang": Debe ser la frase o texto original COMPLETO que el usuario ingresó.
        ii. "example_target_lang": Debe ser la traducción COMPLETA de esa frase original (es decir, la "Traducción Principal").
    c.  Adicionalmente, si es pertinente para el texto original, identifica 1 o MÁXIMO 2 alternativas de traducción o sinónimos comunes para el SIGNIFICADO GENERAL del TEXTO ORIGINAL, o para partes CLAVE del mismo, siempre expresados en el "Idioma de Destino" ("${targetLanguageName}").
    d.  Para cada una de estas ALTERNATIVAS ADICIONALES (si las hay):
        i.  "alternative_in_target_lang": Coloca la alternativa de traducción.
        ii. "example_original_lang": Proporciona una frase de ejemplo CORTA Y CLARA en el "Idioma Detectado" que use el texto original o un concepto muy similar al que se refiere la alternativa.
        iii. "example_target_lang": Proporciona la traducción de esa frase de ejemplo al "Idioma de Destino", asegurándote de que esta traducción utilice la ALTERNATIVA específica que estás ejemplificando.
4.  Formato de Salida: Devuelve ÚNICAMENTE un objeto JSON válido y bien formado con las siguientes claves:
    *   "detected_language_code": El código ISO 639-1 del "Idioma Detectado". (Ej: "es", "en")
    *   "translation": La "Traducción Principal" COMPLETA del texto original al "Idioma de Destino".
    *   "dictionary_entries": Un array de objetos.
        *   La PRIMERA entrada es para la "Traducción Principal".
        *   Las entradas subsecuentes (si existen, máximo 2) son para las alternativas.
        *   Cada objeto debe tener: "alternative_in_target_lang", "example_original_lang", "example_target_lang".

Ejemplo si el usuario escribe: "hola como te ha ido el dia de hoy?" (Detectado: Español) y targetLanguage es Inglés:
{
  "detected_language_code": "es",
  "translation": "hello, how has your day been today?",
  "dictionary_entries": [
    {
      "alternative_in_target_lang": "hello, how has your day been today?",
      "example_original_lang": "hola como te ha ido el dia de hoy?",
      "example_target_lang": "hello, how has your day been today?"
    },
    {
      "alternative_in_target_lang": "Hi, how was your day?",
      "example_original_lang": "Qué tal tu día?",
      "example_target_lang": "How was your day?"
    }
  ]
}

Ejemplo si el usuario escribe "sin embargo" (Detectado: Español) y targetLanguage es Inglés:
{
  "detected_language_code": "es",
  "translation": "however",
  "dictionary_entries": [
    {"alternative_in_target_lang": "however", "example_original_lang": "Es bueno; sin embargo, caro.", "example_target_lang": "It's good; however, expensive."},
    {"alternative_in_target_lang": "nevertheless", "example_original_lang": "No estudió; sin embargo, aprobó.", "example_target_lang": "He didn't study; nevertheless, he passed."}
  ]
}
Asegúrate de que el JSON sea estrictamente válido. No incluyas texto, comentarios o explicaciones fuera del objeto JSON. El JSON debe ser parseable directamente.`;

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
            if (jsonMatch && jsonMatch[0]) {
              responseContent = jsonMatch[0];
            }
            const parsedResponse: TranslationApiResponse = JSON.parse(responseContent);

            if (parsedResponse && parsedResponse.translation && parsedResponse.detected_language_code) {
              this.outputText = parsedResponse.translation;
              this.dictionaryEntries = parsedResponse.dictionary_entries || [];
              const previousDetectedCode = this.detectedSourceLanguageCode;
              this.detectedSourceLanguageCode = parsedResponse.detected_language_code.toLowerCase();
              this.detectedSourceLanguageDisplay = `Detectado: ${this.getLanguageName(this.detectedSourceLanguageCode)}`;

              const targetLangBeforeAutoChange = this.targetLanguage;
              let autoTargetChanged = false;

              if (!this.isManualTargetSelection && !this.isRetranslatingForDictionary) {
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
                console.log('Target language was auto-adjusted or updated. Re-calling API to update dictionary examples for new target:', this.targetLanguage);
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
        error: (error) => {
          this.handleApiError('Error en llamada API.', error);
        }
      }),
      catchError(error => {
        this.handleApiError('Error HTTP en la llamada a la API.', error);
        return of(null);
      })
    );
  }

  private handleApiError(message: string, errorData?: any, parseError?: any) {
    this.isLoading = false;
    this.outputText = `Error: ${message}`;
    this.detectedSourceLanguageDisplay = 'Error de traducción';
    this.dictionaryEntries = [];
    console.error(message, 'Datos del error:', errorData, 'Error de parseo (si aplica):', parseError);
  }
}