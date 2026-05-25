-- document_objects table document_type check constraint update
alter table document_objects
  drop constraint if exists document_objects_document_type_check;

alter table document_objects
  add constraint document_objects_document_type_check
  check (document_type in (
    'deal_curiosity_report',
    'blind_teaser',
    'buyer_fit_memo',
    'owner_prep_memo',
    'missing_data_checklist',
    'gate_request_note',
    'building_snapshot_draft',
    'im_lite_draft'
  ));
