-- PeopleConnect family: CheckPeople, PeopleLooker, NeighborWho all redirect to
-- suppression.peopleconnect.us/login — same opt-out backend as BeenVerified, PeopleSmart etc.
INSERT OR IGNORE INTO brokers (id, name, url, country, type, script_file, active) VALUES
('checkpeople',   'CheckPeople',  'https://www.checkpeople.com/do-not-sell-info',                  'US', 'auto', 'checkpeople.js',   1),
('peoplelooker',  'PeopleLooker', 'https://www.peoplelooker.com/svc/optout/search/optouts',         'US', 'auto', 'peoplelooker.js',  1),
('neighborwho',   'NeighborWho',  'https://www.neighborwho.com/svc/optout/search/optouts',          'US', 'auto', 'neighborwho.js',   1),
('nuwber',        'Nuwber',       'https://nuwber.com/removal/link',                                'US', 'auto', 'nuwber.js',        1),
('familytreenow', 'FamilyTreeNow','https://www.familytreenow.com/optout',                           'US', 'auto', 'familytreenow.js', 1),
('infotracer',    'InfoTracer',   'https://infotracer.com/optout/',                                 'US', 'auto', 'infotracer.js',    1);

-- Semi-automated brokers (CAPTCHA required — show manual guide with link)
INSERT OR IGNORE INTO brokers (id, name, url, country, type, script_file, manual_guide, active) VALUES
('truepeoplesearch', 'TruePeopleSearch', 'https://www.truepeoplesearch.com/removal',               'US', 'semi', NULL,
'## TruePeopleSearch

1. Visit https://www.truepeoplesearch.com/removal
2. Enter your name, city, and state to find your record
3. Click on your record to open it
4. Click "Remove This Record" at the bottom
5. Complete the reCAPTCHA
6. Submit — removal is processed within 24 hours.', 1),

('thatsthem', 'ThatsThem', 'https://thatsthem.com/optout',                                         'US', 'semi', NULL,
'## ThatsThem

1. Visit https://thatsthem.com/optout
2. Fill in your first name, last name, and address
3. Enter your email address
4. Solve the reCAPTCHA
5. Submit — confirmation by email within 72 hours.', 1),

('zoominfo', 'ZoomInfo', 'https://www.zoominfo.com/privacy',                                       'US', 'semi', NULL,
'## ZoomInfo

1. Visit https://www.zoominfo.com/privacy
2. Click "Manage My Profile"
3. Search for your profile by name
4. Open your profile and click "Free Profile Removal"
5. Provide your business email address
6. Verify via email confirmation code.', 1);
