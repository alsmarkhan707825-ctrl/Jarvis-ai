# Keep JARVIS AI native classes and JS/network models intact when R8 minification runs.
-keep class com.jarvisai.assistant.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
