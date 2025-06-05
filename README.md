# LinguAI: Tu Asistente Inteligente de Traducción y Aprendizaje de Idiomas

![LinguAI Logo](https://i.postimg.cc/XqJxDqKX/logo-langu-AI.png)

¡Hola a todos! Permítanme presentarles **LinguAI**, una aplicación web diseñada para revolucionar la forma en que interactuamos con diferentes idiomas. No es solo un traductor; es una herramienta de aprendizaje que te ofrece traducciones precisas, alternativas contextuales y ejemplos de uso, todo impulsado por la inteligencia artificial de vanguardia.

## ✨ Características Principales

*   **Traducción Inteligente:** Traduce texto entre múltiples idiomas (Español, Inglés, Francés, Portugués) con alta precisión.
*   **Detección Automática de Idioma:** LinguAI identifica automáticamente el idioma del texto que ingresas.
*   **Diccionario Contextual:**
    *   Obtén la **traducción principal** de tu texto.
    *   Explora **alternativas de traducción** o sinónimos comunes.
    *   Aprende con **frases de ejemplo** en el idioma original y en el idioma de destino para cada alternativa, ayudándote a comprender el uso en diferentes contextos.
*   **Síntesis de Voz (Text-to-Speech):** Escucha la pronunciación tanto del texto original como de la traducción (disponible para Español e Inglés).
*   **Interfaz Intuitiva y Moderna:** Diseñada con Tailwind CSS para una experiencia de usuario fluida y agradable.
*   **Copia Fácil:** Copia la traducción principal a tu portapapeles con un solo clic.
*   **Manejo de Errores:** Notificaciones claras en caso de problemas con la API o la síntesis de voz.

## 🚀 ¿Cómo Funciona?

LinguAI utiliza el poder de la API de **Cerebras (modelo `llama-4-scout-17b-16e-instruct`)** para realizar las traducciones y generar el contenido del diccionario.

1.  **Entrada de Usuario:** Escribes o pegas el texto que deseas traducir.
2.  **Petición a la API:**
    *   Se envía el texto a la API de Cerebras junto con un *system prompt* cuidadosamente diseñado.
    *   Este prompt instruye al modelo para que:
        1.  Detecte el idioma del texto original.
        2.  Proporcione una traducción principal completa.
        3.  Genere entradas de diccionario, donde la primera entrada es la traducción principal y las siguientes son alternativas. Cada entrada incluye ejemplos de uso en ambos idiomas.
3.  **Respuesta JSON:** La API devuelve un objeto JSON estructurado con el código del idioma detectado, la traducción principal y un array de entradas de diccionario.
4.  **Visualización:** La interfaz de Angular procesa esta respuesta y la muestra de forma clara:
    *   El texto original y su idioma detectado.
    *   La traducción principal.
    *   Una sección de "Diccionario" con las alternativas y sus ejemplos.
5.  **Funciones Adicionales:**
    *   Puedes seleccionar manualmente el idioma de destino. La lista de idiomas de destino se ajusta para no incluir el idioma fuente detectado.
    *   Los botones de "escuchar" utilizan la API `SpeechSynthesis` del navegador para la reproducción de audio.
    *   El botón de "copiar" utiliza la API `navigator.clipboard`.

El componente `HomeComponent` (ubicado en `src/app/pages/home/home.component.ts`) maneja la lógica principal, incluyendo:
*   Debouncing de la entrada del usuario para optimizar las llamadas a la API.
*   Gestión del estado de carga y errores.
*   Interacción con el `ApiService` (en `src/app/services/api.service.ts`) para las traducciones.
*   Actualización dinámica de la interfaz.

El `ApiService` encapsula la comunicación con la API de Cerebras, incluyendo la gestión de la API Key y el procesamiento de la respuesta.
La interfaz de usuario principal se define en `src/app/pages/home/home.component.html`.

## 🛠️ Tecnologías Utilizadas

*   **Frontend:**
    *   [Angular](https://angular.io/) (v16)
    *   [TypeScript](https://www.typescriptlang.org/)
    *   [RxJS](https://rxjs.dev/) para la programación reactiva.
    *   HTML5 y CSS3
    *   [Tailwind CSS](https://tailwindcss.com/) para el diseño UI.
*   **Backend (API):**
    *   [Cerebras AI API](https://www.cerebras.net/product-cloud/) (utilizando el modelo `llama-4-scout-17b-16e-instruct`)
*   **Otros:**
    *   API `SpeechSynthesis` del navegador para Text-to-Speech.

## 🧑‍💻 Autor

**Johan Morales**

*   LinkedIn: [johan-morales-b3809b206](https://www.linkedin.com/in/johan-morales-b3809b206/)
*   Portafolio: [johanmorales211.github.io/portafolio-personal/](https://johanmorales211.github.io/portafolio-personal/)

---

¡Gracias por su atención! Espero que LinguAI les resulte una herramienta útil y enriquecedora para sus necesidades de traducción y aprendizaje de idiomas. ¡Cualquier feedback es bienvenido!

