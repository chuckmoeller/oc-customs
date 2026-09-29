"""initial_schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-09-26 10:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. organizations
    op.create_table(
        'organizations',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # 2. memberships
    op.create_table(
        'memberships',
        sa.Column('uid', sa.Text(), nullable=False),
        sa.Column('org_id', sa.UUID(), nullable=False),
        sa.Column('role', sa.Text(), server_default='member', nullable=False),
        sa.Column('email', sa.Text(), nullable=True),
        sa.Column('display_name', sa.Text(), nullable=True),
        sa.Column('photo_url', sa.Text(), nullable=True),
        sa.Column('auth_provider', sa.Text(), nullable=True),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('status', sa.Text(), server_default='active', nullable=False),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('uid')
    )
    op.create_index('ix_memberships_org_id', 'memberships', ['org_id'])

    # 3. jobs
    op.create_table(
        'jobs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('org_id', sa.UUID(), nullable=False),
        sa.Column('firestore_id', sa.String(64), nullable=True),
        sa.Column('user_id', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Text(), nullable=True),
        sa.Column('client_name', sa.Text(), nullable=True),
        sa.Column('job_number', sa.Text(), nullable=True),
        sa.Column('client_group', sa.Text(), nullable=True),
        sa.Column('status', sa.Text(), server_default='Start Here', nullable=False),
        sa.Column('advisor', sa.Text(), nullable=True),
        sa.Column('job_date', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('device_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('scan_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('city', sa.Text(), nullable=True),
        sa.Column('state', sa.Text(), nullable=True),
        sa.Column('building_type', sa.Text(), nullable=True),
        sa.Column('entity_type', sa.Text(), nullable=True),
        sa.Column('utility_name', sa.Text(), nullable=True),
        sa.Column('sqft', sa.Numeric(12, 2), nullable=True),
        sa.Column('operating_hours_per_day', sa.Numeric(4, 2), nullable=True),
        sa.Column('operating_days_per_week', sa.Numeric(3, 1), nullable=True),
        sa.Column('contact_name', sa.Text(), nullable=True),
        sa.Column('contact_email', sa.Text(), nullable=True),
        sa.Column('contact_phone', sa.Text(), nullable=True),
        sa.Column('asana_project_gid', sa.String(64), nullable=True),
        sa.Column('asana_synced', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('asana_last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('billing_utility_name', sa.Text(), nullable=True),
        sa.Column('billing_account_number', sa.Text(), nullable=True),
        sa.Column('billing_month_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('billing_last_imported_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('firestore_id'),
        sa.UniqueConstraint('asana_project_gid')
    )
    op.create_index('ix_jobs_org_id', 'jobs', ['org_id'])
    op.create_index('ix_jobs_job_number', 'jobs', ['job_number'])

    # 4. devices
    op.create_table(
        'devices',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('job_id', sa.UUID(), nullable=False),
        sa.Column('org_id', sa.UUID(), nullable=False),
        sa.Column('firestore_id', sa.String(64), nullable=True),
        sa.Column('user_id', sa.Text(), nullable=True),
        sa.Column('name', sa.Text(), nullable=True),
        sa.Column('device_name', sa.Text(), nullable=True),
        sa.Column('category', sa.Text(), nullable=True),
        sa.Column('subcategory', sa.Text(), nullable=True),
        sa.Column('subcategory_detail', sa.Text(), nullable=True),
        sa.Column('equipment_type', sa.Text(), nullable=True),
        sa.Column('manufacturer', sa.Text(), nullable=True),
        sa.Column('model_number', sa.Text(), nullable=True),
        sa.Column('serial_number', sa.Text(), nullable=True),
        sa.Column('voltage', sa.Text(), nullable=True),
        sa.Column('tonnage', sa.Text(), nullable=True),
        sa.Column('btu', sa.Text(), nullable=True),
        sa.Column('compressor_count', sa.Integer(), nullable=True),
        sa.Column('compressor_hp', sa.Text(), nullable=True),
        sa.Column('compressor_hp_estimated', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('compressor_rla', sa.Text(), nullable=True),
        sa.Column('compressor_rla_estimated', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('compressor_lra', sa.Text(), nullable=True),
        sa.Column('compressor_ph', sa.Text(), nullable=True),
        sa.Column('mca', sa.Text(), nullable=True),
        sa.Column('mocp', sa.Text(), nullable=True),
        sa.Column('fan_count', sa.Integer(), nullable=True),
        sa.Column('evaporator_count', sa.Integer(), nullable=True),
        sa.Column('fan_ph', sa.Text(), nullable=True),
        sa.Column('fan_rla', sa.Text(), nullable=True),
        sa.Column('fan_fla', sa.Text(), nullable=True),
        sa.Column('fan_hp', sa.Text(), nullable=True),
        sa.Column('motor_type', sa.Text(), nullable=True),
        sa.Column('aoe', sa.Text(), nullable=True),
        sa.Column('quantity', sa.Integer(), server_default='1', nullable=False),
        sa.Column('mfg_year', sa.Integer(), nullable=True),
        sa.Column('mfg_date', sa.Text(), nullable=True),
        sa.Column('refrigerant_type', sa.Text(), nullable=True),
        sa.Column('refrigerant_charge', sa.Text(), nullable=True),
        sa.Column('weight', sa.Text(), nullable=True),
        sa.Column('seer', sa.Text(), nullable=True),
        sa.Column('eer', sa.Text(), nullable=True),
        sa.Column('iplv', sa.Text(), nullable=True),
        sa.Column('cop', sa.Text(), nullable=True),
        sa.Column('oil_type', sa.Text(), nullable=True),
        sa.Column('oil_charge', sa.Text(), nullable=True),
        sa.Column('design_pressure_high', sa.Text(), nullable=True),
        sa.Column('design_pressure_low', sa.Text(), nullable=True),
        sa.Column('ahri_number', sa.Text(), nullable=True),
        sa.Column('status', sa.Text(), server_default='Start Here', nullable=False),
        sa.Column('advisor', sa.Text(), nullable=True),
        sa.Column('device_date', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('imported_from_asana', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('asana_project_gid', sa.String(64), nullable=True),
        sa.Column('asana_task_gid', sa.String(64), nullable=True),
        sa.Column('asana_synced', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('asana_last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('enrichment_missing_fields', postgresql.ARRAY(sa.String()).with_variant(sa.JSON(), 'sqlite'), nullable=False),
        sa.Column('enrichment_last_attempt', sa.DateTime(timezone=True), nullable=True),
        sa.Column('enrichment_attempts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('enrichment_grounding_failed', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('enrichment_reocr_done', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('model_match_confirmed', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('model_match_source', sa.Text(), nullable=True),
        sa.Column('ashrae_205_class', sa.Text(), nullable=True),
        sa.Column('matched_base_model', sa.Text(), nullable=True),
        sa.Column('tonnage_source', sa.Text(), nullable=True),
        sa.Column('tonnage_original', sa.Text(), nullable=True),
        sa.Column('tonnage_override', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('requires_human_audit', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('firestore_id'),
        sa.UniqueConstraint('asana_task_gid')
    )
    op.create_index('ix_devices_job_id', 'devices', ['job_id'])
    op.create_index('ix_devices_org_id', 'devices', ['org_id'])
    op.create_index('ix_devices_model_number', 'devices', ['model_number'])
    op.create_index('ix_devices_serial_number', 'devices', ['serial_number'])

    # 5. device_field_provenance
    op.create_table(
        'device_field_provenance',
        sa.Column('device_id', sa.UUID(), nullable=False),
        sa.Column('field_name', sa.Text(), nullable=False),
        sa.Column('source', sa.Text(), nullable=False),
        sa.Column('confirmed', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('decoded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('device_id', 'field_name')
    )

    # 6. scans
    op.create_table(
        'scans',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('org_id', sa.UUID(), nullable=False),
        sa.Column('firestore_id', sa.String(64), nullable=True),
        sa.Column('user_id', sa.Text(), nullable=True),
        sa.Column('device_id', sa.UUID(), nullable=True),
        sa.Column('image_url', sa.Text(), nullable=True),
        sa.Column('image_path', sa.Text(), nullable=True),
        sa.Column('image_bucket', sa.Text(), nullable=True),
        sa.Column('image_size', sa.BigInteger(), nullable=True),
        sa.Column('nameplate_label', sa.Text(), nullable=True),
        sa.Column('analysis_provider', sa.Text(), nullable=True),
        sa.Column('analysis_model', sa.Text(), nullable=True),
        sa.Column('analysis_result', postgresql.JSONB().with_variant(sa.JSON(), 'sqlite'), nullable=True),
        sa.Column('analysis_confidence', sa.Numeric(5, 4), nullable=True),
        sa.Column('analysis_analyzed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('job_number', sa.Text(), nullable=True),
        sa.Column('equipment_type', sa.Text(), nullable=True),
        sa.Column('location', sa.Text(), nullable=True),
        sa.Column('asana_synced', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('asana_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('asana_story_gid', sa.String(64), nullable=True),
        sa.Column('asana_task_gid', sa.String(64), nullable=True),
        sa.Column('asana_project_gid', sa.String(64), nullable=True),
        sa.Column('status', sa.Text(), server_default='pending', nullable=False),
        sa.Column('tags', postgresql.ARRAY(sa.String()).with_variant(sa.JSON(), 'sqlite'), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('taxonomy', sa.Text(), nullable=True),
        sa.Column('photo_index', sa.Integer(), server_default='0', nullable=False),
        sa.Column('image_hash', sa.String(64), nullable=True),
        sa.Column('sharpness_score', sa.Numeric(6, 3), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('firestore_id')
    )
    op.create_index('ix_scans_org_id', 'scans', ['org_id'])
    op.create_index('ix_scans_device_id', 'scans', ['device_id'])
    op.create_index('ix_scans_job_number', 'scans', ['job_number'])
    op.create_index('ix_scans_image_hash', 'scans', ['image_hash'])

    # 7. supporting_photos
    op.create_table(
        'supporting_photos',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('scan_id', sa.UUID(), nullable=False),
        sa.Column('label', sa.Text(), nullable=True),
        sa.Column('url', sa.Text(), nullable=False),
        sa.Column('path', sa.Text(), nullable=True),
        sa.Column('size', sa.BigInteger(), nullable=True),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.ForeignKeyConstraint(['scan_id'], ['scans.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_supporting_photos_scan_id', 'supporting_photos', ['scan_id'])

    # 8. job_billing
    op.create_table(
        'job_billing',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('job_id', sa.UUID(), nullable=False),
        sa.Column('org_id', sa.UUID(), nullable=False),
        sa.Column('account_number', sa.Text(), server_default='', nullable=False),
        sa.Column('month', sa.Text(), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('kwh_usage', sa.Numeric(14, 2), nullable=True),
        sa.Column('demand_kw', sa.Numeric(10, 2), nullable=True),
        sa.Column('service_charge', sa.Numeric(10, 2), nullable=True),
        sa.Column('energy_charge', sa.Numeric(10, 2), nullable=True),
        sa.Column('demand_charge', sa.Numeric(10, 2), nullable=True),
        sa.Column('taxes', sa.Numeric(10, 2), nullable=True),
        sa.Column('total_amount', sa.Numeric(12, 2), nullable=True),
        sa.Column('utility_name', sa.Text(), nullable=True),
        sa.Column('canonical_utility', sa.Text(), nullable=True),
        sa.Column('canonical_state', sa.Text(), nullable=True),
        sa.Column('days_in_period', sa.Integer(), nullable=True),
        sa.Column('source_asset_id', sa.String(64), nullable=True),
        sa.Column('source_filename', sa.Text(), nullable=True),
        sa.Column('imported_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('job_id', 'account_number', 'year', 'month', name='uq_job_billing_account_period')
    )
    op.create_index('ix_job_billing_job_id', 'job_billing', ['job_id'])
    op.create_index('ix_job_billing_org_id', 'job_billing', ['org_id'])

    # 9. utilities
    op.create_table(
        'utilities',
        sa.Column('state', sa.String(2), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('state', 'name')
    )

    # 10. spec_cache
    op.create_table(
        'spec_cache',
        sa.Column('cache_key', sa.Text(), nullable=False),
        sa.Column('manufacturer', sa.Text(), nullable=True),
        sa.Column('model_number', sa.Text(), nullable=True),
        sa.Column('fields', postgresql.JSONB().with_variant(sa.JSON(), 'sqlite'), nullable=False),
        sa.Column('sources', postgresql.JSONB().with_variant(sa.JSON(), 'sqlite'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_verified_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('cache_key')
    )
    op.create_index('ix_spec_cache_created_at', 'spec_cache', ['created_at'])

    # 11. image_cache
    op.create_table(
        'image_cache',
        sa.Column('image_hash', sa.String(64), nullable=False),
        sa.Column('payload', postgresql.JSONB().with_variant(sa.JSON(), 'sqlite'), nullable=False),
        sa.Column('category', sa.Text(), nullable=True),
        sa.Column('subcategory', sa.Text(), nullable=True),
        sa.Column('manufacturer', sa.Text(), nullable=True),
        sa.Column('model_number', sa.Text(), nullable=True),
        sa.Column('serial_number', sa.Text(), nullable=True),
        sa.Column('source', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_verified_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('image_hash')
    )
    op.create_index('ix_image_cache_created_at', 'image_cache', ['created_at'])


def downgrade() -> None:
    op.drop_table('image_cache')
    op.drop_table('spec_cache')
    op.drop_table('utilities')
    op.drop_table('job_billing')
    op.drop_table('supporting_photos')
    op.drop_table('scans')
    op.drop_table('device_field_provenance')
    op.drop_table('devices')
    op.drop_table('jobs')
    op.drop_table('memberships')
    op.drop_table('organizations')
