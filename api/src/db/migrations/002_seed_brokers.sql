INSERT OR IGNORE INTO brokers (id, name, url, country, type, script_file, manual_guide, active) VALUES
('spokeo',           'Spokeo',             'https://www.spokeo.com/optout',                        'US', 'auto', 'spokeo.js',           NULL, 1),
('whitepages',       'WhitePages',         'https://www.whitepages.com/suppression_requests/new',  'US', 'auto', 'whitepages.js',        NULL, 1),
('beenverified',     'BeenVerified',       'https://www.beenverified.com/app/optout/search',       'US', 'auto', 'beenverified.js',      NULL, 1),
('intelius',         'Intelius',           'https://www.intelius.com/opt-out',                     'US', 'auto', 'intelius.js',          NULL, 1),
('peoplefinder',     'PeopleFinder',       'https://www.peoplefinder.com/optout.php',              'US', 'auto', 'peoplefinder.js',      NULL, 1),
('mylife',           'MyLife',             'https://www.mylife.com/privacy/remove',                'US', 'auto', 'mylife.js',            NULL, 1),
('truthfinder',      'TruthFinder',        'https://www.truthfinder.com/opt-out',                  'US', 'auto', 'truthfinder.js',       NULL, 1),
('radaris',          'Radaris',            'https://radaris.com/ng/control/privacy',               'US', 'auto', 'radaris.js',           NULL, 1),
('fastpeoplesearch', 'FastPeopleSearch',   'https://www.fastpeoplesearch.com/removal',             'US', 'auto', 'fastpeoplesearch.js',  NULL, 1),
('ussearch',         'USSearch',           'https://www.ussearch.com/opt-out/',                    'US', 'auto', 'ussearch.js',          NULL, 1),
('instantcheckmate', 'Instant Checkmate',  'https://www.instantcheckmate.com/opt-out',             'US', 'auto', 'instantcheckmate.js',  NULL, 1),
('peekyou',          'PeekYou',            'https://www.peekyou.com/about/contact/optout',         'US', 'auto', 'peekyou.js',           NULL, 1),
('publicrecords',    'PublicRecordsNow',   'https://www.publicrecordsnow.com/static/view/optout',  'US', 'auto', 'publicrecords.js',     NULL, 1),
('addresssearch',    'AddressSearch',      'https://www.addresssearch.com/remove.php',             'US', 'auto', 'addresssearch.js',     NULL, 1),
('zabasearch',       'ZabaSearch',         'https://www.zabasearch.com/reference/optout.html',     'US', 'auto', 'zabasearch.js',        NULL, 1),
('peoplesmartus',    'PeopleSmart',        'https://www.peoplesmart.com/optout-go',                'US', 'semi', 'peoplesmart.js',       NULL, 1),
('anywho',           'AnyWho',             'https://www.anywho.com/optout',                        'US', 'semi', 'anywho.js',            NULL, 1),
('411',              '411.com',            'https://www.411.com/privacy',                          'US', 'semi', '411.js',               NULL, 1),
('acxiom',     'Acxiom',     'https://www.acxiom.com/about-acxiom/privacy/us-consumer-data-opt-out/', 'US', 'manual', NULL,
'## Acxiom

1. Visit https://isapps.acxiom.com/optout/optout.aspx
2. Click "Opt Out of Acxiom Information Products"
3. Complete the form with your name and address
4. Submit — confirmation by email within 30 days.', 1),
('lexisnexis',  'LexisNexis', 'https://optout.lexisnexis.com/', 'US', 'manual', NULL,
'## LexisNexis

1. Visit https://optout.lexisnexis.com/
2. Select "Opt Out of LexisNexis Risk Solutions"
3. Complete identity verification (government ID required)
4. Submit — processing takes up to 30 days.', 1),
('equifax',     'Equifax',    'https://www.equifax.com/personal/education/privacy/', 'US', 'manual', NULL,
'## Equifax

1. Visit https://www.equifax.com/personal/credit-report-services/
2. Use the online dispute portal or call 1-866-349-5191
3. Request suppression of marketing data.', 1),
('experian',    'Experian',   'https://www.experian.com/privacy/opting_out.html', 'US', 'manual', NULL,
'## Experian

1. Visit https://www.experian.com/privacy/opting_out.html
2. Complete the opt-out form
3. You may need to provide SSN last 4 digits for verification.', 1),
('transunion',  'TransUnion', 'https://www.transunion.com/consumer-privacy', 'US', 'manual', NULL,
'## TransUnion

1. Visit https://www.transunion.com/consumer-privacy
2. Click "Opt Out" under the marketing opt-out section
3. Complete the form — allow 5 business days.', 1);
