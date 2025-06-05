import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface DictionaryEntry {
  alternative_in_target_lang: string;
  example_original_lang?: string;
  example_target_lang?: string;
}

export interface TranslationApiResponse {
  detected_language_code: string;
  translation: string;
  dictionary_entries?: DictionaryEntry[];
}

export interface CerebrasChatCompletionResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly CEREBRAS_API_KEY = 'csk-e3w55h2rwv5w664x3vecn9v4j4554hyvhkdwykcdwvrv82pf';
  private readonly CEREBRAS_API_BASE_URL = 'https://api.cerebras.ai/v1';
  private readonly CEREBRAS_MODEL_ID = 'llama-4-scout-17b-16e-instruct';

  constructor(private http: HttpClient) { }

  private handleError(error: HttpErrorResponse, operation: string = 'operation') {
    let errorMessage = `Error en ${operation}: `;
    if (error.error instanceof ErrorEvent) {
      errorMessage += `Error: ${error.error.message}`;
    } else {
      errorMessage += `Código ${error.status}, cuerpo: ${JSON.stringify(error.error)}`;
    }
    console.error(errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }

  translateText(text: string, targetLanguageCode: string, targetLanguageName: string, systemPromptTemplate: string): Observable<TranslationApiResponse> {
    if (!this.CEREBRAS_API_KEY.startsWith('csk-')) {
        const errorMsg = 'Clave API de Cerebras no configurada o inválida.';
        console.error(errorMsg);
        return throwError(() => new Error(errorMsg));
    }

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.CEREBRAS_API_KEY}`,
      'Content-Type': 'application/json'
    });

    const systemPrompt = systemPromptTemplate.replace(/\$\{targetLanguageName\}/g, targetLanguageName);

    const apiUrl = `${this.CEREBRAS_API_BASE_URL}/chat/completions`;
    const body = {
      model: this.CEREBRAS_MODEL_ID,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      temperature: 0.35,
      max_completion_tokens: 2800,
      top_p: 1,
      stream: false
    };

    return this.http.post<CerebrasChatCompletionResponse>(apiUrl, body, { headers }).pipe(
      map(response => {
        let responseContent = response?.choices?.[0]?.message?.content || '{}';
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        if (jsonMatch && jsonMatch[0]) {
          responseContent = jsonMatch[0];
        }
        try {
          const parsedResponse: TranslationApiResponse = JSON.parse(responseContent);
          if (!parsedResponse.translation || !parsedResponse.detected_language_code) {
            throw new Error('Respuesta JSON parseada pero incompleta o con formato incorrecto.');
          }
          return parsedResponse;
        } catch (e: any) {
          const errorMsg = `Error al procesar la respuesta de traducción (JSON inválido): ${e.message}`;
          console.error(errorMsg, 'Contenido original:', responseContent);
          throw new Error(errorMsg);
        }
      }),
      catchError(err => this.handleError(err, 'translateText'))
    );
  }
}