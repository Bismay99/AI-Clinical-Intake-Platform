# Product Requirements Document (PRD)
## PS 47 — AI-Powered Pre-Consultation Clinical Intake System

**Version:** 1.0 (Hackathon/SIH MVP scope)
**Status:** Draft for team alignment before architecture and `brain.py` generation
**Source:** Consolidated from the PS 47 Detailed Hackathon Report

---

## 1. Problem & Objectives

### 1.1 Problem statement
High-volume Indian hospital OPDs give doctors very limited consultation time per patient, while patient
histories and prior records are frequently incomplete, fragmented, handwritten, multilingual, or
disorganized. This forces doctors to spend consultation time on repetitive history-taking and manual
record reconstruction instead of examination and clinical decision-making.

### 1.2 Objective
Build an AI-powered, multilingual, patient-facing **pre-consultation intake layer** that:
- Captures structured medical history via voice + touch before the doctor consultation.
- Digitizes and structures existing physical medical documents.
- Builds a longitudinal, evidence-linked patient timeline.
- Delivers a doctor-facing, evidence-backed clinical summary for review before/at consultation start.

### 1.3 What this product explicitly is NOT
- Not an "AI doctor" — no autonomous diagnosis or prescription.
- Not a generic medical chatbot.
- Not just an OCR scanner or an ABHA app clone.
- Not an ambient scribe competing with Abridge/Nabla/Dragon Copilot (those operate *during* consultation; this operates *before* it).

### 1.4 Success criteria for MVP/demo
- One complete patient journey demonstrated end-to-end: intake → document scan → extraction → timeline → doctor review → verified record.
- At least one intentionally low-confidence field correctly flagged and shown as flagged (not silently resolved).
- Doctor dashboard requires authorization — no free-text patient-ID search of arbitrary records.
- Clear, visible separation between AI-suggested data and doctor-verified data.

---

## 2. Patient Workflow

1. Patient arrives at hospital and completes registration/identification through the hospital's existing process.
2. Patient is assigned to an OPD/doctor queue.
3. Patient uses a kiosk/tablet (or personal app, in personal mode).
4. Patient selects language.
5. Patient speaks naturally about the chief complaint and history (voice) and/or uses guided touch input.
6. AI asks adaptive follow-up questions based on what's already known.
7. Patient scans/uploads previous prescriptions, lab reports, discharge summaries.
8. Patient may review key extracted information before submission (where appropriate).
9. Patient submits the intake for clinician review.

**Personal mode note:** a companion personal app lets a patient maintain a structured record ahead of a visit, but access must always be authenticated, authorized, and governed by the hospital/health-data consent model — no assumption that any doctor can freely search any patient ID.

---

## 3. Hospital / Kiosk Workflow

1. Hospital registration/patient identification (existing hospital system of record).
2. Patient assignment to OPD/doctor queue.
3. Kiosk/tablet session tied to that patient + encounter (not a standalone, unauthenticated chatbot).
4. Intake session output is attached to the specific encounter, not a free-floating record.
5. Handoff to doctor queue once intake is submitted.
6. Final verified clinical information can flow into the hospital record, at the ABDM/FHIR-compatible interoperability boundary where applicable.

---

## 4. Doctor Dashboard Workflow

1. Doctor sees only their **authorized patient queue** — never an unrestricted searchable database.
2. Doctor opens a patient record via hospital identity/encounter context.
3. Doctor views: chief complaint, symptoms, past history, medications, allergies, investigations, relevant documents.
4. Doctor views a chronological timeline of events.
5. Doctor sees uncertainty/low-confidence flags alongside source evidence.
6. Doctor can **Accept / Edit / Reject** each AI-extracted field.
7. Doctor proceeds with normal clinical examination and decision-making — the AI output is a starting point, not a diagnosis.

### 4.1 Suggested dashboard layout
| Panel | Contents |
|---|---|
| Patient header | Name/ID, encounter, language, status |
| Summary | Chief complaint + concise structured history |
| Risk/attention flags | Missing/uncertain information (not autonomous diagnosis) |
| Timeline | Chronological events |
| Documents | Original scans/reports |
| Evidence | Source location for each extracted field |
| Verification | Accept / Edit / Reject controls |

---

## 5. AI Intake Workflow

The intake engine sits between the patient interface and the structured record. Its job is to convert
unstructured speech/touch input into a clinically organized, evidence-backed draft — never a final
clinical fact.

```
Patient speech/touch
      ↓
ASR + language normalization
      ↓
Clinical schema mapping
      ↓
Adaptive question selection (next-question logic)
      ↓
Structured history draft
```

Adaptive questioning must be **schema/rule-governed**, not a free-running LLM conversation: the LLM may
generate natural-language phrasing, but a clinical schema/rule layer decides which information is
relevant and safe to request next (example: chest pain → onset → exertion/radiation/associated symptoms).

---

## 6. Voice / ASR Requirements

- Support English + Hindi/Hinglish at minimum for MVP; add one regional language only if the team can validate its quality.
- Use an Indian-language-capable ASR (e.g., AI4Bharat's ASR work is relevant research/resource).
- ASR output must be normalized before being mapped into clinical fields — raw transcription is not treated as a structured fact.
- Noise-robust behavior for kiosk environments is a stretch goal, not MVP-critical.
- Optional: voice confirmation, where the patient hears back the extracted information for correction.

---

## 7. OCR / Document Processing Requirements

- Accept scanned prescriptions, lab reports, discharge summaries (photo or scan).
- Pipeline: OCR → layout/handwriting processing → medical entity extraction → normalization → confidence estimation.
- The original document and the exact source location/page must be retained and linked to every extracted field.
- Low-confidence extractions must be flagged, not silently converted into accepted clinical facts.
- MVP scope: prescription + lab report document types; extract medication, date, test/result, and key history fields.

---

## 8. Adaptive Questioning Requirements

- Driven by a clinical schema/rule layer, not a fixed questionnaire and not an unconstrained LLM chat.
- Next question depends on already-collected information (symptom-pathway logic).
- MVP scope: one or two symptom pathways fully built out (e.g., chest pain pathway) rather than broad shallow coverage.
- Must support **configurable schemas** so the same pipeline can switch from general/allopathic fields to AYUSH-specific fields (Prakriti, Vikriti, Agni, Koshtha, Ahara-Vihara, Nidana, Samprapti) without rewriting the application — this is a key "live stress test" resilience point.

---

## 9. Patient Record Structure

Core entities the data model must support:
- **Patient** — identity/demographics (via hospital-authorized workflow).
- **Encounter** — links a patient to a specific OPD visit/queue/doctor.
- **Intake session** — the voice/touch conversation and its structured output, tied to an encounter.
- **Document** — original scanned file + metadata (type, upload time, page count).
- **Extracted entity** — a structured clinical fact (medication, symptom, date, test/result, etc.), always linked to:
  - its source (document + page/region, or intake session + turn),
  - a confidence score,
  - a verification status (unreviewed / accepted / edited / rejected),
  - who reviewed it and when.
- **Timeline event** — normalized, dated clinical event (visit, diagnosis mention, medication, investigation, admission), with an "uncertain date" marker where applicable.
- **Clinical summary** — the generated physician-ready synthesis, itself composed of evidence-linked extracted entities (not free-standing AI prose treated as fact).

**Design rule:** the LLM is never the source of truth. Every clinical fact must be traceable to a document or a specific patient statement.

---

## 10. Medical Timeline Requirements

- Normalize dates and event types across all documents and intake sessions into one chronological view.
- Event types: visits, diagnoses reported in source documents, medications, investigations, admissions, other relevant events.
- Uncertain/ambiguous dates remain explicitly marked as uncertain rather than guessed into a fixed date.
- MVP scope: 3–5 synthetic/consented historical events per demo patient is sufficient to demonstrate the concept.

---

## 11. Authentication / Authorization Requirements

- Separate authentication for patients and clinicians.
- Doctors can only access patients/encounters they are authorized for (queue-based access, not open search).
- Kiosk/personal-app sessions must be tied to a verified patient identity via the hospital's identification workflow.
- Role-based access control (RBAC) across patient, doctor, and (if present) admin/IT roles.

---

## 12. Privacy & Consent Requirements

- Data minimization: collect only what the clinical workflow requires.
- Consent: data sharing/access follows the applicable consent model (aligned with ABDM's consent-based sharing approach).
- Retention policy: define how long documents and intermediate AI artifacts (raw ASR text, intermediate OCR output) are retained.
- Do not depend on real patient data for hackathon development — use synthetic/consented test data only.
- Encryption in transit and at rest is a production requirement (architecture should account for it even if not fully implemented in the demo).
- Audit logging of access and material changes to a patient record.

---

## 13. ABDM / FHIR Integration Boundary

- Architecture should be **FHIR-oriented** in its data modeling from the start (so future mapping is not a rewrite).
- Present ABDM as a **consent-aware interoperability target**, not a claim of full production integration.
- MVP scope: demonstrate the architecture and, where feasible, a sandbox/mock integration boundary.
- Never claim full ABDM certification or production deployment in the demo — be explicit that production access requires formal onboarding, security validation, and applicable certification.

---

## 14. Doctor Verification Requirements

- Every AI-extracted field must expose: the extracted value, a confidence indicator, and a link to its source evidence.
- Doctor actions per field: **Accept / Edit / Reject**.
- Only doctor-verified data should be treated as the "final" clinical record; AI-extracted-but-unverified data must be visually distinguishable from verified data at all times.
- The system must support a visible "doctor edited this AI value" trail for audit purposes.

---

## 15. AI Safety Rules

- No autonomous diagnosis. No autonomous prescription generation.
- AI output pipeline is strictly: **Extract/Summarize → Confidence + Evidence → Doctor Review → Final Clinical Record.** The doctor is always the final clinical decision-maker.
- Every clinically relevant AI output must remain reviewable and editable by a clinician before being treated as final.
- Low-confidence or ambiguous extractions must be flagged rather than silently normalized into a confident-looking fact.
- No fabricated accuracy claims, and no fabricated ABDM/FHIR certification claims, in either the product or the demo narrative.

---

## 16. Database Schema (high-level, MVP)

Minimum tables/entities:
- `patients` (id, demographics, hospital identifier link)
- `encounters` (id, patient_id, doctor_id, queue status, timestamps)
- `intake_sessions` (id, encounter_id, language, raw transcript ref, status)
- `documents` (id, encounter_id, type, storage ref, upload timestamp)
- `extracted_entities` (id, source_type [document|intake], source_ref, field_name, value, confidence, verification_status, reviewed_by, reviewed_at)
- `timeline_events` (id, patient_id, event_type, date, date_confidence, source_entity_id)
- `clinical_summaries` (id, encounter_id, generated_text, generated_at, entity_refs)
- `users` (id, role [patient|doctor|admin], auth credentials, hospital affiliation)
- `audit_logs` (id, user_id, action, target_entity, timestamp)

Recommended storage: PostgreSQL for structured data; encrypted object storage for original document scans.

---

## 17. API Requirements (high-level, MVP)

- **Patient/intake APIs:** start session, submit voice turn, submit touch answer, upload document, submit intake for review.
- **AI processing APIs (internal):** ASR transcription, adaptive-question-next, OCR + extraction, confidence scoring, timeline generation, summary generation.
- **Doctor APIs:** get authorized queue, get patient summary, get timeline, get document + evidence location, accept/edit/reject entity, finalize record.
- **Auth APIs:** patient auth, clinician auth, role/session management.
- **Interoperability (mock/sandbox):** FHIR-shaped export of a finalized record; ABDM sandbox boundary stub.

Framework suggestion: FastAPI (Python) or Node.js REST APIs; internal AI orchestration isolated behind its own service boundary (see `brain.py` in the architecture doc) so it can be swapped/evaluated independently of the CRUD backend.

---

## 18. Frontend Screens (MVP)

**Patient kiosk/app:**
1. Language selection
2. Identity/encounter confirmation (via hospital workflow)
3. Voice + touch intake screen (chief complaint + adaptive questions)
4. Document scan/upload screen
5. Review/confirm screen (optional, before submission)
6. Submission confirmation

**Doctor dashboard:**
1. Authorized patient queue
2. Patient summary view
3. Timeline view
4. Document viewer with evidence highlighting
5. Verification controls (Accept/Edit/Reject) per field
6. Finalize/complete review action

---

## 19. Testing Requirements

Minimum evaluation metrics for the MVP demo:
- **History completeness** — % of required fields captured.
- **Question relevance** — clinician-rated relevance of follow-up questions.
- **OCR extraction accuracy** — field-level precision/recall or exact/normalized match against ground truth.
- **ASR quality** — word error rate or task-specific entity accuracy.
- **Summary faithfulness** — clinician comparison of AI summary against source record.
- **Processing time** — intake-to-summary latency.
- **Doctor editing rate** — % of AI fields changed by the clinician.
- **Low-confidence detection rate** — % of intentionally ambiguous test fields correctly flagged.

**Test data:** a synthetic/consented set — approximately 20 prescriptions, 20 lab reports, 10 discharge summaries, 20 simulated patient conversations, spanning English, Hindi/Hinglish, and (optionally) one validated regional language. Each document needs a maintained ground-truth answer key.

---

## 20. MVP vs. Future Features

### MVP (build first)
- One clean patient kiosk/app intake flow.
- Voice intake in English + Hindi/Hinglish.
- One or two adaptive symptom pathways.
- Document scanning for prescriptions + lab reports.
- OCR/extraction of medication, date, test/result, and key history fields.
- Timeline with 3–5 synthetic/consented historical events.
- Doctor dashboard: queue → patient → summary → documents.
- Evidence linkage: click extracted field → see source document.
- Accept/Edit/Reject verification.
- FHIR-oriented architecture + mock/sandbox ABDM boundary (no false production claims).

### Explicitly NOT in MVP
- Autonomous diagnosis or prescription generation.
- Coverage of every disease/specialty.
- All 22 Indian languages (only what the team can properly validate).
- Full national-scale ABDM production deployment.
- Complex hardware beyond what the demo needs.
- A large, unfocused list of "AI agents" with no measurable purpose.

### Future roadmap (post-hackathon)
- Broader specialty/schema coverage (configurable clinical templates).
- Noise-robust kiosk speech mode.
- Voice confirmation of extracted data back to the patient.
- Document-quality pre-check before extraction.
- Confidence-based review queue prioritization for doctors.
- Medication normalization (without altering the original source record).
- Human-in-the-loop correction data feeding quality analytics (governed, not blind retraining on sensitive data).
- Offline/edge fallback for constrained deployment environments.
- Formal ABDM onboarding and production FHIR integration.
- Hospital → district → state scaling, subject to clinical and security validation.

---

## 21. Positioning Statement (for reference)

> "We are building the missing pre-consultation intelligence layer between the patient and the hospital's clinical workflow" — not an AI doctor, not a generic chatbot, not another ambient scribe.

---

## 22. Next Steps (per team's stated workflow)

1. ✅ PRD (this document) — finalize with team sign-off.
2. System Architecture — formalize service boundaries (patient UI, AI intake engine, document AI, clinical logic, structured record, doctor dashboard, interoperability layer).
3. Database + API contracts — lock schema and endpoint contracts against Sections 16–18 above.
4. `brain.py` — build the AI orchestration layer (ASR → language → adaptive questions → document understanding → evidence/provenance → confidence scoring → timeline → summary → safety rules) strictly against this PRD's Sections 5–15.
5. FastAPI backend, Patient UI, Doctor Dashboard, ABDM/FHIR layer.
6. Testing against Section 19 metrics.
7. Final demo per the one-patient-journey script (Ramesh Kumar, chest pain, Hindi/Hinglish, prescription + investigation report scan).
