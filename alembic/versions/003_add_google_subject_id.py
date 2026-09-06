"""Add google_subject_id to users and make hashed_password nullable

Revision ID: 003
Revises: 002
Create Date: 2026-09-05
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = [col["name"] for col in insp.get_columns("users")]

    with op.batch_alter_table("users", recreate="always") as batch_op:
        if "google_subject_id" not in cols:
            batch_op.add_column(
                sa.Column("google_subject_id", sa.String(255), nullable=True)
            )
        batch_op.alter_column(
            "hashed_password",
            existing_type=sa.String(255),
            nullable=True,
        )

    # Ensure unique index exists on google_subject_id
    existing_indexes = [idx["name"] for idx in insp.get_indexes("users")]
    if "ix_users_google_subject_id" not in existing_indexes:
        op.create_index(
            "ix_users_google_subject_id",
            "users",
            ["google_subject_id"],
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_indexes = [idx["name"] for idx in insp.get_indexes("users")]
    if "ix_users_google_subject_id" in existing_indexes:
        op.drop_index("ix_users_google_subject_id", table_name="users")

    with op.batch_alter_table("users", recreate="always") as batch_op:
        batch_op.drop_column("google_subject_id")
        batch_op.alter_column(
            "hashed_password",
            existing_type=sa.String(255),
            nullable=False,
        )