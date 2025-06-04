import { Component } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../components/header/header.component';
import { FooterComponent } from '../../components/footer/footer.component';

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
export class HomeComponent {
  sourceLanguage: string = 'detect';
  targetLanguage: string = 'en';
  inputText: string = '';
  outputText: string = '';
  isLoading: boolean = false;

  private readonly CEREBRAS_API_KEY = 'csk-ffh452j2kvw8mjdtkkye36e4h623epnvwprnnc3e2y3d62t8';
  private readonly CEREBRAS_API_BASE_URL = 'https://api.cerebras.ai/v1';
  private readonly CEREBRAS_MODEL_ID = 'llama-4-scout-17b-16e-instruct';

  constructor(private http: HttpClient) {}

  getLanguageName(code: string): string {
    switch (code) {
      case 'es': return 'español';
      case 'en': return 'inglés';
      case 'fr': return 'francés';
      case 'pt': return 'portugués';
      default: return code;
    }
  }

  onInputTextChanged() {

  }

  async translateText() {
    if (!this.inputText.trim()) {
      this.outputText = '';
      return;
    }

    this.isLoading = true;
    this.outputText = '';

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.CEREBRAS_API_KEY}`,
      'Content-Type': 'application/json'
    });

    let systemPrompt = `Eres un traductor experto. Traduce el texto proporcionado al ${this.getLanguageName(this.targetLanguage)}.`;
    if (this.sourceLanguage !== 'detect') {
      systemPrompt += ` El texto de entrada está en ${this.getLanguageName(this.sourceLanguage)}.`;
    } else {
      systemPrompt += ` Detecta automáticamente el idioma del texto de entrada.`;
    }

    const apiUrl = `${this.CEREBRAS_API_BASE_URL}/chat/completions`;

    const body = {
      model: this.CEREBRAS_MODEL_ID,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: this.inputText }
      ],
      temperature: 0.2,
      max_completion_tokens: 1024,
      top_p: 1,
      stream: false
    };

    try {
      const response: any = await this.http.post<any>(apiUrl, body, { headers }).toPromise();

      if (response && response.choices && response.choices.length > 0 && response.choices[0].message && response.choices[0].message.content) {
        this.outputText = response.choices[0].message.content.trim();
      } else {
        this.outputText = 'Error: Formato de respuesta inesperado de la API de Cerebras.';
        console.error('Respuesta inesperada de la API de Cerebras:', response);
      }
    } catch (error: any) {
      console.error('Error al traducir con Cerebras:', error);
      this.outputText = 'Error al conectar con el servicio de Cerebras.';

      if (error.status === 401) {
        this.outputText = 'Error de Autenticación (401) con Cerebras: Verifica tu API Key.';
      } else if (error.status === 400) {
        this.outputText = 'Error de Solicitud (400) con Cerebras: Revisa los parámetros enviados.';
        if (error.error && error.error.error && error.error.error.message) {
           this.outputText += ` Detalle: ${error.error.error.message}`;
        } else if (error.error && error.error.message) {
           this.outputText += ` Detalle: ${error.error.message}`;
        }
      } else if (error.status === 404) {
         this.outputText = `Error (404): Endpoint o modelo no encontrado en Cerebras. Verifica la URL y el ID del modelo.`;
      } else if (error.status === 429) {
         this.outputText = `Error (429): Demasiadas solicitudes a la API de Cerebras. Por favor, espera un momento.`;
      } else if (error.error && error.error.message) {
         this.outputText = `Error desde la API de Cerebras: ${error.error.message}`;
      } else if (error.error && error.error.detail) {
         this.outputText = `Error desde la API de Cerebras: ${error.error.detail}`;
      } else if (error.message) {
         this.outputText = `Error de Red/HTTP: ${error.message}`;
      }
    } finally {
      this.isLoading = false;
    }
  }
}