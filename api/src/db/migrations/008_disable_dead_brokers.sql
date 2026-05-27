-- AddressSearch and PublicRecordsNow return 404 on their opt-out pages (sites defunct)
UPDATE brokers SET active = 0 WHERE id IN ('addresssearch', 'publicrecords');

-- MyLife moved their CCPA opt-out from /privacy/remove to /ccpa/index.pubview
UPDATE brokers SET url = 'https://www.mylife.com/ccpa/index.pubview' WHERE id = 'mylife';
