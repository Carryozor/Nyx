-- Additional auto-scriptable data brokers
INSERT OR IGNORE INTO brokers (id, name, url, country, type, script_file, active) VALUES
('fastbackgroundcheck',  'FastBackgroundCheck',  'https://www.fastbackgroundcheck.com/removal',        'US', 'auto', 'fastbackgroundcheck.js',  1),
('cyberbackgroundchecks','CyberBackgroundChecks', 'https://www.cyberbackgroundchecks.com/removal',      'US', 'auto', 'cyberbackgroundchecks.js', 1),
('searchpeoplefree',     'SearchPeopleFREE',      'https://www.searchpeoplefree.com/opt-out',            'US', 'auto', 'searchpeoplefree.js',      1),
('usapeoplesearch',      'USA People Search',     'https://www.usapeoplesearch.com/optout/',             'US', 'auto', 'usapeoplesearch.js',       1),
('voterrecords',         'VoterRecords',          'https://voterrecords.com/faq',                        'US', 'auto', 'voterrecords.js',          1),
('isearch',              'iSearch',               'https://www.isearch.com',                             'US', 'auto', 'isearch.js',               1);
