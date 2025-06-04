import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, switchMap, tap } from 'rxjs/operators';

import { HeaderComponent } from '../../components/header/header.component';
import { FooterComponent } from '../../components/footer/footer.component';

interface TranslationApiResponse {
  detected_language_code: string;
  translation: string;
  recommendations?: string;
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
  detectedSourceLanguageDisplay: string = '';
  recommendationsOutput: string = '';

  isLoading: boolean = false;
  private isManualTargetSelection: boolean = false;

  private inputTextChange$ = new Subject<string>();
  private translationSubscription!: Subscription;

  private readonly CEREBRAS_API_KEY = 'csk-ffh452j2kvw8mjdtkkye36e4h623epnvwprnnc3e2y3d62t8';
  private readonly CEREBRAS_API_BASE_URL = 'https://api.cerebras.ai/v1';
  private readonly CEREBRAS_MODEL_ID = 'llama-4-scout-17b-16e-instruct';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.translationSubscription = this.inputTextChange$.pipe(
      debounceTime(1000),
      distinctUntilChanged(),
      tap(text => {
        if (text.trim().length === 0) {
          this.clearOutputs();
          this.isLoading = false;
        }
      }),
      filter(text => text.trim().length > 0),
      tap(() => {
        this.isLoading = true;
        this.outputText = '';
        this.recommendationsOutput = '';
        this.detectedSourceLanguageDisplay = 'Detectando...';
        this.isManualTargetSelection = false;
      }),
      switchMap(text => this.callTranslationAPI(text))
    ).subscribe();
  }

  ngOnDestroy(): void {
    if (this.translationSubscription) {
      this.translationSubscription.unsubscribe();
    }
  }

  getLanguageName(code: string): string {
    switch (code) {
      case 'es': return 'Español';
      case 'en': return 'Inglés';
      case 'fr': return 'Francés';
      case 'pt': return 'Portugués';
      case 'detect': return 'Detectar Idioma';
      default: return code;
    }
  }

  clearOutputs(): void {
    this.outputText = '';
    this.recommendationsOutput = '';
    this.detectedSourceLanguageDisplay = this.inputText.trim().length > 0 ? 'Escribe para detectar idioma...' : '';
  }

  onInputTextChanged(): void {
    this.inputTextChange$.next(this.inputText);
  }

  onTargetLanguageChanged(): void {
    this.isManualTargetSelection = true;
    if (this.inputText.trim().length > 0) {
      this.isLoading = true;
      this.outputText = '';
      this.recommendationsOutput = '';
      this.detectedSourceLanguageDisplay = 'Traduciendo con nuevo destino...';
      this.callTranslationAPI(this.inputText).subscribe();
    }
  }

  private callTranslationAPI(text: string) {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.CEREBRAS_API_KEY}`,
      'Content-Type': 'application/json'
    });

    const targetLanguageName = this.getLanguageName(this.targetLanguage);

    const systemPrompt = `Eres un tutor de idiomas avanzado y preciso. Tu tarea es:
1.  Detectar el idioma del texto original proporcionado por el usuario. Que sea el "Idioma Detectado".
2.  Traducir el texto del usuario al idioma "${targetLanguageName}". Que sea el "Idioma de Destino".
3.  Generar recomendaciones y ejemplos de uso sobre el TEXTO TRADUCIDO. Estas recomendaciones deben ser BILINGÜES para máxima claridad:
    *   Primero, proporciona una breve explicación o nota sobre el uso o matiz del texto traducido EN EL "Idioma Detectado".
    *   Luego, proporciona 1 o 2 frases de ejemplo cortas que utilicen la traducción o partes clave de ella. Estas frases de ejemplo DEBEN ESTAR ESCRITAS en el "Idioma de Destino" ("${targetLanguageName}").
    *   Si el texto traducido es muy simple, las recomendaciones pueden ser más breves, pero intenta mantener la estructura bilingüe si es posible.
    *   Formatea las recomendaciones de manera clara, usando saltos de línea (\\n) entre la explicación en el "Idioma Detectado" y los ejemplos en el "Idioma de Destino". Puedes usar etiquetas como "Explicación ({Idioma Detectado}):" y "Ejemplos ({Idioma de Destino}):".
4.  Devolver ÚNICAMENTE un objeto JSON válido con tres claves:
    *   "detected_language_code": El código ISO 639-1 del "Idioma Detectado" (ej: "es", "en").
    *   "translation": El texto traducido al "Idioma de Destino" ("${targetLanguageName}").
    *   "recommendations": Una cadena de texto formateada con las recomendaciones bilingües como se describió arriba. Si no hay recomendaciones significativas, puede ser una cadena vacía o una nota breve como "Uso común.".

Ejemplo si el usuario escribe "Estoy aquí esperándote" (Idioma Detectado será Español) y el targetLanguage es Inglés (Idioma de Destino: Inglés):
{
  "detected_language_code": "es",
  "translation": "I am here waiting for you.",
  "recommendations": "Explicación (Español): Esta frase es una forma directa y común de informar a alguien de tu presencia y expectativa.\\n\\nEjemplos (Inglés):\\n1. 'Call me when you arrive, I am here waiting for you at the cafe.'\\n2. 'Don't worry, take your time. I am here waiting for you.'"
}

Ejemplo si el usuario escribe "Thank you" (Idioma Detectado será Inglés) y el targetLanguage es Español (Idioma de Destino: Español):
{
  "detected_language_code": "en",
  "translation": "Gracias.",
  "recommendations": "Explanation (English): This is the most common way to express gratitude.\\n\\nEjemplos (Español):\\n1. 'Gracias por tu ayuda.'\\n2. 'Muchas gracias, lo aprecio mucho.'"
}

Asegúrate de que el JSON sea estrictamente válido. No incluyas texto fuera del JSON. Los saltos de línea en las recomendaciones deben ser \\n.`;

    const apiUrl = `${this.CEREBRAS_API_BASE_URL}/chat/completions`;
    const body = {
      model: this.CEREBRAS_MODEL_ID,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      temperature: 0.4,
      max_completion_tokens: 2000,
      top_p: 1,
      stream: false
    };

    return this.http.post<any>(apiUrl, body, { headers }).pipe(
      tap({
        next: (response) => {
          this.isLoading = false;
          try {
            let responseContent = response?.choices?.[0]?.message?.content || '{}';
            const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
            if (jsonMatch && jsonMatch[0]) {
              responseContent = jsonMatch[0];
            }

            const parsedResponse: TranslationApiResponse = JSON.parse(responseContent);

            if (parsedResponse && parsedResponse.translation && parsedResponse.detected_language_code) {
              this.outputText = parsedResponse.translation;
              this.recommendationsOutput = parsedResponse.recommendations || `No se proporcionaron recomendaciones específicas para "${parsedResponse.translation}" en ${targetLanguageName}.`;

              const detectedCode = parsedResponse.detected_language_code.toLowerCase();
              const detectedLanguageName = this.getLanguageName(detectedCode);
              this.detectedSourceLanguageDisplay = `Detectado: ${detectedLanguageName}`;

              if (!this.isManualTargetSelection) {
                let newTargetLang = this.targetLanguage;
                if (detectedCode === 'es' && this.targetLanguage !== 'en') {
                  newTargetLang = 'en';
                } else if (detectedCode !== 'es' && this.targetLanguage !== 'es') {
                  newTargetLang = 'es';
                }
                if (this.targetLanguage !== newTargetLang) {
                  this.targetLanguage = newTargetLang;
                }
              }
            } else {
              this.handleApiError('Respuesta JSON no válida o incompleta de la API.', parsedResponse);
            }
          } catch (e) {
            this.handleApiError('Error al procesar la respuesta de la API (parseo JSON).', response?.choices?.[0]?.message?.content, e);
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.detectedSourceLanguageDisplay = 'Error de API';
          if (error.status === 401) {
            this.outputText = 'Error de Autenticación (401). Verifica tu API Key.';
          } else if (error.status === 400 && error.error?.message) {
            this.outputText = `Error de Solicitud (400): ${error.error.message}`;
          } else if (error.error?.message) {
             this.outputText = `Error API: ${error.error.message}`;
          } else {
            this.outputText = 'Error al conectar con el servicio de Cerebras.';
          }
          console.error('Error en la llamada a la API de Cerebras:', error);
          this.recommendationsOutput = '';
        }
      })
    );
  }

  private handleApiError(message: string, responseData?: any, parseError?: any) {
    this.isLoading = false;
    this.outputText = message;
    this.detectedSourceLanguageDisplay = 'Error de procesamiento';
    this.recommendationsOutput = '';
    console.error(message, 'Datos de respuesta:', responseData, 'Error de parseo:', parseError);
  }
}