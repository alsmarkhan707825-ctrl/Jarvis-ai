package com.jarvisai.assistant.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class MemoryRecord(
    val id: String,
    val personality: String,
    val category: String,
    val key: String,
    val value: String,
    val updatedAt: Long
)

data class ConversationRecord(
    val id: String,
    val personality: String,
    val role: String,
    val content: String,
    val emotion: String,
    val createdAt: Long
)

class JarvisDatabase(context: Context) : SQLiteOpenHelper(context, "jarvis_assistant.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                personality TEXT NOT NULL,
                category TEXT NOT NULL,
                mem_key TEXT NOT NULL,
                mem_value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                personality TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                emotion TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS memories")
        db.execSQL("DROP TABLE IF EXISTS messages")
        onCreate(db)
    }

    fun upsertMemory(record: MemoryRecord) {
        val values = ContentValues().apply {
            put("id", record.id)
            put("personality", record.personality)
            put("category", record.category)
            put("mem_key", record.key)
            put("mem_value", record.value)
            put("updated_at", record.updatedAt)
        }
        writableDatabase.insertWithOnConflict("memories", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun getMemoriesForPersonality(personality: String): List<MemoryRecord> {
        val list = mutableListOf<MemoryRecord>()
        val cursor = readableDatabase.query(
            "memories",
            null,
            "personality = ?",
            arrayOf(personality),
            null,
            null,
            "updated_at DESC"
        )
        cursor.use {
            while (it.moveToNext()) {
                list.add(
                    MemoryRecord(
                        id = it.getString(it.getColumnIndexOrThrow("id")),
                        personality = it.getString(it.getColumnIndexOrThrow("personality")),
                        category = it.getString(it.getColumnIndexOrThrow("category")),
                        key = it.getString(it.getColumnIndexOrThrow("mem_key")),
                        value = it.getString(it.getColumnIndexOrThrow("mem_value")),
                        updatedAt = it.getLong(it.getColumnIndexOrThrow("updated_at"))
                    )
                )
            }
        }
        return list
    }

    fun appendMessage(msg: ConversationRecord) {
        val values = ContentValues().apply {
            put("id", msg.id)
            put("personality", msg.personality)
            put("role", msg.role)
            put("content", msg.content)
            put("emotion", msg.emotion)
            put("created_at", msg.createdAt)
        }
        writableDatabase.insert("messages", null, values)
    }
}
