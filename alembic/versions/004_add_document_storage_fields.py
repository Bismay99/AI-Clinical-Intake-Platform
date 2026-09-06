"""Add patient_id, file_size, mime_type, and processing_status to documents

Revision ID: 004
Revises: 003
Create Date: 2026-09-06
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = [col["name"] for col in insp.get_columns("documents")]

    with op.batch_alter_table("documents") as batch_op:
        if "patient_id" not in cols:
            batch_op.add_column(
                sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id"), nullable=True)
            )
        if "file_size" not in cols:
            batch_op.add_column(
                sa.Column("file_size", sa.Integer(), nullable=True)
            )
        if "mime_type" not in cols:
            batch_op.add_column(
                sa.Column("mime_type", sa.String(100), nullable=True)
            )
        if "processing_status" not in cols:
            batch_op.add_column(
                sa.Column("processing_status", sa.String(50), server_default="processed", nullable=True)
            )


def downgrade() -> None:
    with op.batch_alter_table("documents") as batch_op:
        batch_op.drop_column("processing_status")
        batch_op.drop_column("mime_type")
        batch_op.drop_column("file_size")
        batch_op.drop_column("patient_id")