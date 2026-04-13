# Content Filter Module — Design Spec

## Goal
Build a non-AI, multi-layer text analysis system that detects and blocks inappropriate content (adult/+18, profanity, hate speech, drugs, scam, weapons) across all user-generated text on the Ultrasooq platform, with admin UI for rule management and violation tracking.

## Architecture
5-layer pipeline running in-process (~2-5ms per field): Unicode normalization → Leetspeak decode → Arabic↔Latin transliteration → Trie-based pattern matching → Severity scoring. Rules stored in PostgreSQL, cached in Redis. Violations logged asynchronously. Admin panel for CRUD rules + violation dashboard.

## Severity Levels
- **SEVERE** → REJECT (not saved) — adult, slurs, hate speech
- **MODERATE** → FLAG (saved as WAITING) — drugs, scam, borderline
- **MILD** → ALLOW + LOG — mild profanity, suggestive

## User Feedback
- SEVERE: generic "Content violates guidelines"
- MODERATE: "Submission under review"
- MILD: no message, logged silently

## Risk Score
`riskScore = (mild × 1) + (moderate × 3) + (severe × 10)`

## Languages
English + Arabic + transliterated Arabic + Unicode evasion + leetspeak
