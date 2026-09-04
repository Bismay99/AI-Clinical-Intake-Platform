"""Initial schema — all Phase 1 tables

Revision ID: 001
Revises:
Create Date: 2026-09-04

Creates all tables defined in the implementation plan Section 5:
  users, patients, encounters, intake_sessions, documents,
  extracted_entities, timeline_events, clinical_summaries, audit_logs
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("role", sa.Enum("patient", "doctor", "admin", name="userrole"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("hospital_affiliation", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean, default=True, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )

    # ── patients ─────────────────────────────────────────────────────────────
    op.create_table(
        "patients",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("hospital_identifier", sa.String(255), nullable=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("date_of_birth", sa.String(10), nullable=True),
        sa.Column("gender", sa.String(50), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("preferred_language", sa.String(10), default="en", nullable=False),
        sa.Column("demographics_json", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )

    # ── encounters ────────────────────────────────────────────────────────────
    op.create_table(
        "encounters",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("doctor_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "queue_status",
            sa.Enum(
                "registered", "intake_in_progress", "submitted",
                "ready_for_review", "completed", name="encounterstatus"
            ),
            default="registered", nullable=False,
        ),
        sa.Column("opd_department", sa.String(255), nullable=True),
        sa.Column("scheduled_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )

    # ── intake_sessions ───────────────────────────────────────────────────────
    op.create_table(
        "intake_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("encounter_id", sa.String(36), sa.ForeignKey("encounters.id"), nullable=False),
        sa.Column("language", sa.String(10), nullable=False),
        sa.Column("schema_id", sa.String(100), nullable=False),
        sa.Column("raw_transcript_ref", sa.String(500), nullable=True),
        sa.Column(
            "status",
            sa.Enum("in_progress", "submitted", "processed", name="intakesessionstatus"),
            default="in_progress", nullable=False,
        ),
        sa.Column("current_field_name", sa.String(100), nullable=True),
        sa.Column("turn_count", sa.String(10), default="0", nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )

    # ── documents ─────────────────────────────────────────────────────────────
    op.create_table(
        "documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("encounter_id", sa.String(36), sa.ForeignKey("encounters.id"), nullable=False),
        sa.Column("document_type", sa.String(50), nullable=False),
        sa.Column("storage_ref", sa.String(500), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=True),
        sa.Column("page_count", sa.Integer, nullable=True),
        sa.Column("language_hint", sa.String(10), default="en", nullable=False),
        sa.Column("upload_timestamp", sa.DateTime, nullable=False),
    )

    # ── extracted_entities ────────────────────────────────────────────────────
    op.create_table(
        "extracted_entities",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("encounter_id", sa.String(36), sa.ForeignKey("encounters.id"), nullable=False),
        sa.Column("source_type", sa.Enum("document", "intake_session", name="sourcetype"), nullable=False),
        sa.Column("source_id", sa.String(36), nullable=False),
        sa.Column("source_location", sa.String(255), nullable=True),
        sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id"), nullable=True),
        sa.Column("field_name", sa.String(100), nullable=False),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("original_ai_value", sa.Text, nullable=True),
        sa.Column("confidence", sa.Float, nullable=False),
        sa.Column("low_confidence_flag", sa.Boolean, default=False, nullable=False),
        sa.Column(
            "verification_status",
            sa.Enum("unreviewed", "accepted", "edited", "rejected", name="verificationstatus"),
            default="unreviewed", nullable=False,
        ),
        sa.Column("reviewed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime, nullable=True),
        sa.Column("metadata_json", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )

    # ── timeline_events ───────────────────────────────────────────────────────
    op.create_table(
        "timeline_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("encounter_id", sa.String(36), sa.ForeignKey("encounters.id"), nullable=False),
        sa.Column("source_entity_id", sa.String(36), sa.ForeignKey("extracted_entities.id"), nullable=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("date", sa.String(10), nullable=True),
        sa.Column("date_confidence", sa.Float, nullable=False, default=0.0),
        sa.Column("date_uncertain", sa.Boolean, default=False, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )

    # ── clinical_summaries ────────────────────────────────────────────────────
    op.create_table(
        "clinical_summaries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("encounter_id", sa.String(36), sa.ForeignKey("encounters.id"), nullable=False, unique=True),
        sa.Column("summary_text", sa.Text, nullable=False),
        sa.Column("used_entity_fields", sa.JSON, nullable=True),
        sa.Column("generated_at", sa.DateTime, nullable=False),
        sa.Column("regenerated_at", sa.DateTime, nullable=True),
    )

    # ── audit_logs ────────────────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("target_entity_type", sa.String(100), nullable=True),
        sa.Column("target_entity_id", sa.String(36), nullable=True),
        sa.Column("detail", sa.Text, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("timestamp", sa.DateTime, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("clinical_summaries")
    op.drop_table("timeline_events")
    op.drop_table("extracted_entities")
    op.drop_table("documents")
    op.drop_table("intake_sessions")
    op.drop_table("encounters")
    op.drop_table("patients")
    op.drop_table("users")

    # Drop custom enum types (PostgreSQL only — SQLite ignores these)
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS userrole")
        op.execute("DROP TYPE IF EXISTS encounterstatus")
        op.execute("DROP TYPE IF EXISTS intakesessionstatus")
        op.execute("DROP TYPE IF EXISTS sourcetype")
        op.execute("DROP TYPE IF EXISTS verificationstatus")
