ALTER TABLE document_objects
  DROP CONSTRAINT IF EXISTS document_objects_document_type_check;

ALTER TABLE document_objects
  ADD CONSTRAINT document_objects_document_type_check
  CHECK (document_type IN (
    'deal_curiosity_report',
    'blind_teaser',
    'buyer_fit_memo',
    'owner_prep_memo',
    'missing_data_checklist',
    'gate_request_note',
    'snapshot',
    'mobile_im',
    'im_lite',
    'im_lite_draft',
    'building_snapshot_draft',
    'im_pro'
  ));
