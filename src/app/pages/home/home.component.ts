import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subject, Observable, of, timer } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, switchMap, tap, catchError, takeUntil } from 'rxjs/operators';

import { HeaderComponent } from '../../components/header/header.component';
import { FooterComponent } from '../../components/footer/footer.component';
import { ApiService, TranslationApiResponse, DictionaryEntry } from '../../services/api.service';

const UI_DEFAULTS = {
  DETECTING_LANGUAGE: 'Detectando...',
  DETECT_PROMPT: 'Escribe para detectar idioma...',
  TRANSLATION_ERROR_DISPLAY: 'Error',
  COPY_BUTTON_DEFAULT_TEXT: 'Copiar traducción',
  COPY_BUTTON_COPIED_TEXT: '¡Copiado!',
  TTS_UNSUPPORTED: 'Tu navegador no soporta la síntesis de voz.',
  TTS_ERROR_GENERAL: 'Error al reproducir el audio.'
};

interface Language {
  code: string;
  name: string;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
  standalone: true,
  imports: [ FormsModule, CommonModule, HeaderComponent, FooterComponent ]
})
export class HomeComponent implements OnInit, OnDestroy {
  inputText: string = '';
  outputText: string = '';
  detectedSourceLanguageDisplay: string = '';
  targetLanguage: string = 'en';
  dictionaryEntries: DictionaryEntry[] = [];
  
  isLoading: boolean = false;
  isSpeakingInput: boolean = false;
  isSpeakingOutput: boolean = false;
  isCopied: boolean = false;
  copyButtonText: string = UI_DEFAULTS.COPY_BUTTON_DEFAULT_TEXT;
  apiError: string | null = null;
  ttsError: string | null = null;

  availableTargetLanguages: Language[] = [];
  private readonly allTargetLanguages: Language[] = [
    { code: 'en', name: 'Inglés' }, { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Francés' }, { code: 'pt', name: 'Portugués' }
  ];
  detectedSourceLanguageCode: string = '';

  private readonly destroy$ = new Subject<void>();
  private inputTextChange$ = new Subject<string>();
  
  private isManualTargetSelection: boolean = false;
  private isRetranslatingForDictionary: boolean = false;

  private speechSynthesis: SpeechSynthesis | null = null;
  private currentInputUtterance: SpeechSynthesisUtterance | null = null;
  private currentOutputUtterance: SpeechSynthesisUtterance | null = null;
  private availableVoices: SpeechSynthesisVoice[] = [];

  private readonly systemPromptTemplate = `Eres un traductor experto y un creador de contenido de diccionario muy detallado.
Tu tarea PRIMORDIAL e INICIAL es traducir el TEXTO COMPLETO proporcionado por el usuario.

Sigue estos pasos estrictamente:
1.  Detecta el idioma del texto original ingresado por el usuario. Llama a este "Idioma Detectado".
2.  **Traducción Principal (Campo "translation")**: Traduce la TOTALIDAD del texto original del usuario al idioma "\${targetLanguageName}". Esta traducción debe ser completa y precisa, reflejando el significado completo de la frase o texto de entrada. NO abrevies, NO resumas, y NO traduzcas solo la primera palabra o una parte para este campo. El campo "translation" en el JSON de salida DEBE contener esta traducción completa.
3.  **Entradas de Diccionario (Campo "dictionary_entries")**:
    a.  La PRIMERA entrada en "dictionary_entries" debe tener su campo "alternative_in_target_lang" EXACTAMENTE IGUAL a la "Traducción Principal" (la traducción completa del paso 2).
    b.  Para esta primera entrada de diccionario:
        i.  "example_original_lang": Debe ser la frase o texto original COMPLETO que el usuario ingresó.
        ii. "example_target_lang": Debe ser la traducción COMPLETA de esa frase original (es decir, la "Traducción Principal").
    c.  Adicionalmente, si es pertinente para el texto original, identifica 1 o MÁXIMO 2 alternativas de traducción o sinónimos comunes para el SIGNIFICADO GENERAL del TEXTO ORIGINAL, o para partes CLAVE del mismo, siempre expresados en el "Idioma de Destino" ("\${targetLanguageName}").
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

  constructor(
    private apiService: ApiService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.speechSynthesis = window.speechSynthesis;
      this.loadVoices();
    }
  }

  ngOnInit(): void {
    this.initializeLanguageSettings();
    this.setupInputTextSubscription();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopAudio();
  }
  
  private loadVoices(): void {
    if (!this.speechSynthesis) return;
    const setVoices = () => {
        this.availableVoices = this.speechSynthesis?.getVoices() || [];
    };
    if (this.speechSynthesis.getVoices().length > 0) {
        setVoices();
    } else {
        this.speechSynthesis.onvoiceschanged = setVoices;
    }
  }

  private initializeLanguageSettings(): void {
    this.detectedSourceLanguageDisplay = UI_DEFAULTS.DETECT_PROMPT;
    this.updateAvailableTargetLanguages();
  }

  private setupInputTextSubscription(): void {
    this.inputTextChange$.pipe(
      debounceTime(1000),
      distinctUntilChanged(),
      tap(text => this.handleDebouncedInput(text)),
      filter(text => text.trim().length > 0 && !this.isRetranslatingForDictionary),
      tap(() => this.prepareForTranslation()),
      switchMap(text => this.fetchTranslation(text, false)),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        if (response) this.processTranslationResponse(response, false);
      },
      error: (err) => this.handleStreamError(err, 'Traducción (Stream Principal)')
    });
  }

  onInputTextChanged(): void {
    this.isManualTargetSelection = false;
    this.isRetranslatingForDictionary = false;
    this.inputTextChange$.next(this.inputText);
  }

  onTargetLanguageChanged(): void {
    this.isManualTargetSelection = true;
    if (this.inputText.trim().length > 0) {
      this.prepareForTranslation();
      this.fetchTranslation(this.inputText, true)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response) this.processTranslationResponse(response, true);
          },
          error: (err) => this.handleStreamError(err, 'Traducción (Cambio de Idioma)')
        });
    }
  }

  playInputText(): void {
    this.speakText(this.inputText, this.detectedSourceLanguageCode, 'input');
  }

  playOutputText(): void {
    this.speakText(this.outputText, this.targetLanguage, 'output');
  }

  private speakText(text: string, langCode: string, type: 'input' | 'output'): void {
    if (!text || (type === 'input' && this.isSpeakingInput) || (type === 'output' && this.isSpeakingOutput)) {
      return;
    }
    if (!this.speechSynthesis) {
      this.displayError(UI_DEFAULTS.TTS_UNSUPPORTED, 'TTS');
      return;
    }

    this.stopAudio();
    this.ttsError = null;

    if (type === 'input') {
      this.isSpeakingInput = true;
    } else {
      this.isSpeakingOutput = true;
    }
    this.cdr.detectChanges();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.mapToBcp47(langCode);

    const preferredVoice = this.findVoice(langCode, type === 'input' ? 'male' : 'female');
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onend = () => {
      this.ngZone.run(() => {
        if (type === 'input') this.isSpeakingInput = false;
        else this.isSpeakingOutput = false;
        
        if (type === 'input') this.currentInputUtterance = null;
        else this.currentOutputUtterance = null;
        this.cdr.detectChanges();
      });
    };

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      this.ngZone.run(() => {
        console.error(`SpeechSynthesis Error (${type}):`, event.error);
        this.displayError(`${UI_DEFAULTS.TTS_ERROR_GENERAL} (${event.error})`, 'TTS');
        if (type === 'input') this.isSpeakingInput = false;
        else this.isSpeakingOutput = false;

        if (type === 'input') this.currentInputUtterance = null;
        else this.currentOutputUtterance = null;
        this.cdr.detectChanges();
      });
    };
    
    if (type === 'input') this.currentInputUtterance = utterance;
    else this.currentOutputUtterance = utterance;

    this.speechSynthesis.speak(utterance);
  }

  private findVoice(langCode: string, gender: 'male' | 'female'): SpeechSynthesisVoice | undefined {
    if (this.availableVoices.length === 0) {
        this.loadVoices(); 
        if(this.availableVoices.length === 0) return undefined;
    }

    const targetLangBcp47 = this.mapToBcp47(langCode);
    
    const genderKeywords = {
        male: ['male', 'man', 'hombre', 'masculine', 'david', 'mark', 'jorge', 'diego', 'paul'],
        female: ['female', 'woman', 'mujer', 'feminine', 'eva', 'susan', 'linda', 'heather', 'zira', 'monica', 'paulina']
    };

    const voicesForLang = this.availableVoices.filter(voice => 
        voice.lang.toLowerCase() === targetLangBcp47.toLowerCase() || 
        voice.lang.toLowerCase().startsWith(langCode.toLowerCase() + '-')
    );

    if (voicesForLang.length === 0) return undefined;

    const genderFilteredVoices = voicesForLang.filter(voice => 
        genderKeywords[gender].some(keyword => voice.name.toLowerCase().includes(keyword))
    );

    if (genderFilteredVoices.length > 0) {
      return genderFilteredVoices[0];
    }
    
    return voicesForLang.find(v => v.default) || voicesForLang[0];
  }

  copyTranslatedText(): void {
    if (!this.outputText) return;
    navigator.clipboard.writeText(this.outputText).then(() => {
      this.isCopied = true;
      this.copyButtonText = UI_DEFAULTS.COPY_BUTTON_COPIED_TEXT;
      this.cdr.detectChanges();
      timer(2000).pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.isCopied = false;
        this.copyButtonText = UI_DEFAULTS.COPY_BUTTON_DEFAULT_TEXT;
        this.cdr.detectChanges();
      });
    }).catch(err => {
      console.error('Error al copiar texto: ', err);
      this.displayError('No se pudo copiar el texto al portapapeles.', 'TTS');
    });
  }

  private handleDebouncedInput(text: string): void {
    this.clearErrors();
    if (text.trim().length === 0) {
      this.resetOutputs();
      this.isLoading = false;
    }
  }

  private prepareForTranslation(): void {
    this.isLoading = true;
    this.outputText = '';
    this.dictionaryEntries = [];
    this.detectedSourceLanguageDisplay = this.detectedSourceLanguageCode
      ? `Detectado: ${this.getLanguageName(this.detectedSourceLanguageCode)}`
      : UI_DEFAULTS.DETECTING_LANGUAGE;
  }

  private fetchTranslation(text: string, isForcedCall: boolean): Observable<TranslationApiResponse | null> {
    if (!this.targetLanguage && this.availableTargetLanguages.length > 0) {
      this.targetLanguage = this.availableTargetLanguages[0].code;
    } else if (!this.targetLanguage && this.availableTargetLanguages.length === 0) {
      this.displayError('No hay idioma de destino disponible.', 'Traducción');
      this.isLoading = false;
      return of(null);
    }
    const targetLanguageName = this.getLanguageName(this.targetLanguage);
    return this.apiService.translateText(text, this.targetLanguage, targetLanguageName, this.systemPromptTemplate)
      .pipe(
        catchError(error => {
          this.displayError(error.message || 'Error en API de traducción.', 'Traducción');
          this.isLoading = false;
          return of(null); 
        })
      );
  }

  private processTranslationResponse(response: TranslationApiResponse, isForcedCall: boolean): void {
    this.isLoading = false;
    this.clearErrors();

    this.outputText = response.translation;
    this.dictionaryEntries = response.dictionary_entries || [];
    this.detectedSourceLanguageCode = response.detected_language_code.toLowerCase();
    this.detectedSourceLanguageDisplay = `Detectado: ${this.getLanguageName(this.detectedSourceLanguageCode)}`;

    const needsRetranslation = this.checkAndAdjustTargetLanguage(isForcedCall);
    if (needsRetranslation) {
      this.isRetranslatingForDictionary = true;
      this.prepareForTranslation();
      this.fetchTranslation(this.inputText, true)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (newResponse) => {
            if (newResponse) this.processTranslationResponse(newResponse, true);
            this.isRetranslatingForDictionary = false;
          },
          error: (err) => {
            this.handleStreamError(err, 'Traducción (Re-traducción Automática)');
            this.isRetranslatingForDictionary = false;
          }
        });
    } else if (this.isRetranslatingForDictionary && !isForcedCall) {
        this.isRetranslatingForDictionary = false;
    }
  }

  getLanguageName(code: string): string {
    if (!code) return '';
    const lang = this.allTargetLanguages.find(l => l.code === code.toLowerCase());
    return lang ? lang.name : code.toUpperCase();
  }

  private updateAvailableTargetLanguages(): boolean {
    const previousTargetLanguage = this.targetLanguage;
    if (this.detectedSourceLanguageCode) {
      this.availableTargetLanguages = this.allTargetLanguages.filter(lang => lang.code !== this.detectedSourceLanguageCode);
    } else {
      this.availableTargetLanguages = [...this.allTargetLanguages];
    }

    let targetLanguageChanged = false;
    if (this.availableTargetLanguages.length > 0) {
      if ((this.detectedSourceLanguageCode && this.targetLanguage === this.detectedSourceLanguageCode) || 
          !this.availableTargetLanguages.find(lang => lang.code === this.targetLanguage)) {
        this.targetLanguage = this.availableTargetLanguages[0].code;
        targetLanguageChanged = true;
      } else if (!this.targetLanguage) {
         this.targetLanguage = this.availableTargetLanguages[0].code;
         targetLanguageChanged = true;
      }
    } else {
        if (this.targetLanguage !== '') {
            this.targetLanguage = '';
            targetLanguageChanged = true;
        }
    }
    return targetLanguageChanged && previousTargetLanguage !== this.targetLanguage;
  }
  
  private checkAndAdjustTargetLanguage(isForcedCall: boolean): boolean {
    if (this.isManualTargetSelection || this.isRetranslatingForDictionary) {
      const listCausedChange = this.updateAvailableTargetLanguages();
      return listCausedChange && !isForcedCall && this.inputText.trim().length > 0;
    }

    let autoTargetChanged = false;
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
    
    const listCausedChangeAfterAuto = this.updateAvailableTargetLanguages();
    
    return (autoTargetChanged || listCausedChangeAfterAuto) && !isForcedCall && this.inputText.trim().length > 0;
  }

  stopAudio(): void {
    if (this.speechSynthesis && this.speechSynthesis.speaking) {
      this.speechSynthesis.cancel();
    }
    if (this.isSpeakingInput) {
      this.ngZone.run(() => { this.isSpeakingInput = false; this.currentInputUtterance = null; this.cdr.detectChanges(); });
    }
    if (this.isSpeakingOutput) {
      this.ngZone.run(() => { this.isSpeakingOutput = false; this.currentOutputUtterance = null; this.cdr.detectChanges(); });
    }
  }

  private mapToBcp47(langCode: string): string {
    if (!langCode) return 'en-US'; 
    const map: { [key: string]: string } = {
      'en': 'en-US',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'pt': 'pt-PT',
    };
    return map[langCode.toLowerCase()] || langCode;
  }

  private resetOutputs(): void {
    this.clearErrors();
    this.outputText = '';
    this.dictionaryEntries = [];
    this.detectedSourceLanguageDisplay = this.inputText.trim().length > 0 ? UI_DEFAULTS.DETECT_PROMPT : '';
    this.detectedSourceLanguageCode = '';
    this.stopAudio();
    this.updateAvailableTargetLanguages();
  }

  private clearErrors(): void {
    this.apiError = null;
    this.ttsError = null;
  }
  
  private displayError(message: string, type: 'Traducción' | 'TTS'): void {
    const fullMessage = `${type} Error: ${message}`;
    console.error(fullMessage);
    if (type === 'Traducción') {
      this.apiError = fullMessage;
      this.outputText = '';
      this.dictionaryEntries = [];
      this.detectedSourceLanguageDisplay = UI_DEFAULTS.TRANSLATION_ERROR_DISPLAY;
    } else if (type === 'TTS') {
      this.ttsError = fullMessage;
    }
    this.isLoading = false;
    this.isSpeakingInput = false; 
    this.isSpeakingOutput = false;
  }

  private handleStreamError(err: any, context: string): void {
    this.isLoading = false;
    this.isSpeakingInput = false;
    this.isSpeakingOutput = false;
    this.displayError(err.message || `Error desconocido en ${context}.`, 'Traducción');
  }
}