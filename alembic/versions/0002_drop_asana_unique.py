"""drop_asana_unique

Revision ID: 0002_drop_asana_unique
Revises: 0001_initial_schema
Create Date: 2026-09-26 11:16:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002_drop_asana_unique'
down_revision: Union[str, None] = '0001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop unique constraints on asana GIDs and replace with non-unique indexes
    op.drop_constraint('jobs_asana_project_gid_key', 'jobs', type_='unique')
    op.create_index('ix_jobs_asana_project_gid', 'jobs', ['asana_project_gid'])

    op.drop_constraint('devices_asana_task_gid_key', 'devices', type_='unique')
    op.create_index('ix_devices_asana_task_gid', 'devices', ['asana_task_gid'])


def downgrade() -> None:
    op.drop_index('ix_devices_asana_task_gid', table_name='devices')
    op.create_unique_constraint('devices_asana_task_gid_key', 'devices', ['asana_task_gid'])

    op.drop_index('ix_jobs_asana_project_gid', table_name='jobs')
    op.create_unique_constraint('jobs_asana_project_gid_key', 'jobs', ['asana_project_gid'])
