package com.jarvisai.assistant.emotion

enum class JarvisEmotion(val label: String) {
    NORMAL("Normal"),
    HAPPY("Happy"),
    LAUGHING("Laughing"),
    ROMANTIC("Romantic"),
    SAD("Sad"),
    ANGRY("Angry"),
    CURIOUS("Curious"),
    SURPRISED("Surprised"),
    EXCITED("Excited"),
    SERIOUS("Serious"),
    CALM("Calm")
}

object EmotionEngine {
    fun fromLabel(raw: String): JarvisEmotion? {
        return JarvisEmotion.entries.firstOrNull { it.label.equals(raw.trim(), ignoreCase = true) }
    }

    fun detectFromContext(userText: String, current: JarvisEmotion = JarvisEmotion.NORMAL): JarvisEmotion {
        val text = userText.lowercase()
        return when {
            Regex("\\b(love you|pyaar|ishq|jaan|baby|sweetheart|miss you|romantic|dil)\\b").containsMatchIn(text) -> JarvisEmotion.ROMANTIC
            Regex("\\b(haha|hehe|lol|funny|joke|mazak|hasi)\\b").containsMatchIn(text) -> JarvisEmotion.LAUGHING
            Regex("\\b(angry|gussa|frustrated|irritated|shut up)\\b").containsMatchIn(text) -> JarvisEmotion.ANGRY
            Regex("\\b(sad|upset|lonely|hurt|dukhi|udaas)\\b").containsMatchIn(text) -> JarvisEmotion.SAD
            Regex("\\b(wow|omg|shocked|really\\?|kya baat|seriously)\\b").containsMatchIn(text) -> JarvisEmotion.SURPRISED
            Regex("\\b(excited|awesome|amazing|party|maza|let's go)\\b").containsMatchIn(text) -> JarvisEmotion.EXCITED
            Regex("\\b(happy|glad|great|khush|shukriya|thanks)\\b").containsMatchIn(text) -> JarvisEmotion.HAPPY
            Regex("\\b(why|how|what|explain|kaise|kyun|\\?)").containsMatchIn(text) -> JarvisEmotion.CURIOUS
            Regex("\\b(urgent|important|warning|security|serious)\\b").containsMatchIn(text) -> JarvisEmotion.SERIOUS
            Regex("\\b(relax|calm|sleep|breathe|shant|meditate)\\b").containsMatchIn(text) -> JarvisEmotion.CALM
            else -> current
        }
    }
}
