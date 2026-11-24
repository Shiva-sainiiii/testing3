-- =====================================================================
-- TestBridge demo seed. ALL NAMES, PHONES AND HOSPITALS ARE FICTIONAL.
-- tb.reset_demo() wipes everything (including the audit log; demo only)
-- and reloads this data with slots relative to today.
-- Prep text is a draft: have a doctor review it before the demo.
-- =====================================================================

create or replace function tb.reset_demo() returns jsonb language plpgsql as $$
declare d date;
begin
  truncate tb.audit_log, tb.idempotency, tb.messages, tb.reports, tb.referral_recipients,
           tb.referrals, tb.home_queue, tb.patients, tb.demo_users, tb.hospital_tests,
           tb.test_types, tb.hospitals restart identity cascade;
  perform setval('tb.ref_code_seq', 1001, false);
  update tb.demo_clock set offset_interval = '0' where id = 1;
  d := tb.ist_date(now());

  insert into tb.hospitals (id, name, short_name, kind, lat, lng, address_en, address_hi, phone) values
  ('A', 'Jan Kalyan Civil Hospital', 'Jan Kalyan CH (A)', 'govt', 29.390, 76.970,
     'Station Road, Demo District', 'स्टेशन रोड, डेमो ज़िला', '0180-0000001'),
  ('B', 'Sarvodaya Sub-District Hospital', 'Sarvodaya SDH (B)', 'govt', 29.480, 76.950,
     'Old Bus Stand Road, Sarvodaya Nagar, Demo District', 'पुराना बस स्टैंड रोड, सर्वोदय नगर, डेमो ज़िला', '0180-0000002'),
  ('C', 'Navjeevan Community Health Centre', 'Navjeevan CHC (C)', 'govt', 29.300, 77.030,
     'Canal Road, Navjeevan, Demo District', 'नहर रोड, नवजीवन, डेमो ज़िला', '0180-0000003'),
  ('D', 'Arogya Diagnostic Centre (PPP)', 'Arogya PPP (D)', 'ppp', 29.420, 77.120,
     'GT Road, Sector 4, Demo District', 'जीटी रोड, सेक्टर 4, डेमो ज़िला', '0180-0000004'),
  ('E', 'Shanti Nagar Community Health Centre', 'Shanti Nagar CHC (E)', 'govt', 29.600, 76.850,
     'Main Bazaar, Shanti Nagar, Demo District', 'मेन बाज़ार, शांति नगर, डेमो ज़िला', '0180-0000005'),
  ('F', 'Ratanpur Primary Health Centre', 'Ratanpur PHC (F)', 'govt', 29.050, 76.800,
     'Village Ratanpur, Demo District', 'गाँव रतनपुर, डेमो ज़िला', '0180-0000006');

  insert into tb.test_types values
  ('MRI', 'MRI scan', 'एमआरआई',
     'No metal items; tell staff about any pacemaker or implant.',
     'धातु की चीज़ें न लाएँ; पेसमेकर/इम्प्लांट हो तो स्टाफ को बताएँ।',
     'Remove all metal (jewellery, hairpins, belt, mobile). Tell staff if you have a pacemaker, implant, metal pieces in the body, or are pregnant. No fasting unless the lab tells you.',
     'सभी धातु की चीज़ें (गहने, पिन, बेल्ट, मोबाइल) उतार दें। पेसमेकर, इम्प्लांट, शरीर में धातु या गर्भावस्था हो तो स्टाफ को बताएँ। जब तक लैब न कहे, खाली पेट आने की ज़रूरत नहीं।',
     'Token / referral slip, OPD card, any photo ID, old reports and films.',
     'टोकन / रेफ़रल पर्ची, OPD कार्ड, कोई फ़ोटो पहचान पत्र, पुरानी रिपोर्ट और फ़िल्में।'),
  ('CT', 'CT scan', 'सीटी स्कैन',
     'Fast 4 hours; bring a recent creatinine report if contrast is planned.',
     '4 घंटे खाली पेट आएँ; कंट्रास्ट हो तो हाल की क्रिएटिनिन रिपोर्ट लाएँ।',
     'Do not eat for 4 hours before the scan. If contrast is planned, bring a recent kidney test (creatinine). Tell staff about allergies, diabetes medicines or pregnancy.',
     'स्कैन से 4 घंटे पहले कुछ न खाएँ। कंट्रास्ट हो तो हाल की किडनी जाँच (क्रिएटिनिन) रिपोर्ट लाएँ। एलर्जी, शुगर की दवा या गर्भावस्था के बारे में स्टाफ को बताएँ।',
     'Token / referral slip, OPD card, photo ID, creatinine report, old reports.',
     'टोकन / रेफ़रल पर्ची, OPD कार्ड, फ़ोटो पहचान पत्र, क्रिएटिनिन रिपोर्ट, पुरानी रिपोर्ट।'),
  ('USG', 'Ultrasound (abdomen)', 'अल्ट्रासाउंड (पेट)',
     'Come 6 hours fasting with a full bladder.',
     '6 घंटे खाली पेट और भरे हुए मूत्राशय के साथ आएँ।',
     'Do not eat for 6 hours. Drink 4–5 glasses of water one hour before and do not pass urine until the scan.',
     '6 घंटे कुछ न खाएँ। जाँच से एक घंटा पहले 4–5 गिलास पानी पिएँ और जाँच तक पेशाब न करें।',
     'Token / referral slip, OPD card, photo ID, old reports.',
     'टोकन / रेफ़रल पर्ची, OPD कार्ड, फ़ोटो पहचान पत्र, पुरानी रिपोर्ट।'),
  ('ECHO', 'Echocardiogram (ECHO)', 'इकोकार्डियोग्राम (ईको)',
     'No special preparation; wear loose clothing.',
     'कोई विशेष तैयारी नहीं; ढीले कपड़े पहनें।',
     'No fasting needed. Take your usual medicines. Wear loose clothing.',
     'खाली पेट आने की ज़रूरत नहीं। अपनी रोज़ की दवाएँ लें। ढीले कपड़े पहनें।',
     'Token / referral slip, OPD card, photo ID, old ECG/ECHO reports.',
     'टोकन / रेफ़रल पर्ची, OPD कार्ड, फ़ोटो पहचान पत्र, पुरानी ECG/ईको रिपोर्ट।'),
  ('TFT', 'Thyroid profile (blood test)', 'थायरॉइड जाँच (खून की जाँच)',
     'Morning sample; take thyroid tablet after the sample.',
     'सुबह सैंपल दें; थायरॉइड की गोली सैंपल के बाद लें।',
     'Come in the morning. If you take a thyroid tablet, take it after the blood sample.',
     'सुबह आएँ। थायरॉइड की गोली लेते हैं तो खून का सैंपल देने के बाद लें।',
     'Token / referral slip, OPD card, photo ID.',
     'टोकन / रेफ़रल पर्ची, OPD कार्ड, फ़ोटो पहचान पत्र।');

  insert into tb.hospital_tests (hospital_id, test_type_id, is_free, price_inr, current_wait_days) values
  ('A', 'MRI', true, null, 14), ('A', 'CT', true, null, 9), ('A', 'USG', true, null, 6),
  ('A', 'ECHO', true, null, 12), ('A', 'TFT', true, null, 3),
  ('B', 'MRI', true, null, 1), ('B', 'CT', true, null, 2), ('B', 'USG', true, null, 1),
  ('C', 'MRI', true, null, 2), ('C', 'USG', true, null, 1), ('C', 'ECHO', true, null, 2),
  ('D', 'MRI', false, 2500, 0), ('D', 'CT', false, 1500, 0),
  ('E', 'USG', true, null, 1), ('E', 'ECHO', true, null, 1),
  ('F', 'USG', true, null, 3), ('F', 'TFT', true, null, 0);

  insert into tb.demo_users (id, name, role, hospital_id) values
  ('doc-a', 'Dr. A. Mehta', 'doctor', 'A'),
  ('lab-b', 'Lab desk, Sarvodaya SDH', 'lab', 'B'),
  ('lab-c', 'Lab desk, Navjeevan CHC', 'lab', 'C'),
  ('lab-d', 'Lab desk, Arogya PPP', 'lab', 'D'),
  ('lab-e', 'Lab desk, Shanti Nagar CHC', 'lab', 'E'),
  ('lab-f', 'Lab desk, Ratanpur PHC', 'lab', 'F'),
  ('dho', 'District Health Officer', 'dho', null);

  insert into tb.patients (id, display_name, age, phone, lang) values
  ('P-RAMESH', 'Ramesh Kumar', 58, '9876500001', 'hi'),
  ('P-SUNITA', 'Sunita Devi', 45, '9876500002', 'hi'),
  ('P-IRFAN', 'Mohd. Irfan', 39, '9876500003', 'hi'),
  ('P-KAVITA', 'Kavita Sharma', 51, '9876500004', 'hi'),
  ('P-BALDEV', 'Baldev Singh', 66, '9876500005', 'hi'),
  ('P-POOJA', 'Pooja Rani', 34, '9876500006', 'hi'),
  ('P-HARISH', 'Harish Chand', 61, '9876500007', 'hi'),
  ('P-ANIL', 'Anil Verma', 47, '9876500010', 'en'),
  ('P-GEETA', 'Geeta Saini', 55, '9876500008', 'hi'),
  ('P-RAMPR', 'Ram Prakash', 70, '9876500009', 'hi');

  -- Hospital A's MRI register: 6 booked, 2 waiting with no date yet.
  insert into tb.home_queue (hospital_id, test_type_id, patient_id, position, slot_at, status) values
  ('A', 'MRI', 'P-ANIL',   1, ((d + 13) + time '10:00') at time zone 'Asia/Kolkata', 'booked'),
  ('A', 'MRI', 'P-RAMESH', 2, ((d + 14) + time '10:00') at time zone 'Asia/Kolkata', 'booked'),
  ('A', 'MRI', 'P-SUNITA', 3, ((d + 14) + time '11:00') at time zone 'Asia/Kolkata', 'booked'),
  ('A', 'MRI', 'P-IRFAN',  4, ((d + 15) + time '10:00') at time zone 'Asia/Kolkata', 'booked'),
  ('A', 'MRI', 'P-KAVITA', 5, ((d + 15) + time '11:00') at time zone 'Asia/Kolkata', 'booked'),
  ('A', 'MRI', 'P-BALDEV', 6, ((d + 16) + time '10:00') at time zone 'Asia/Kolkata', 'booked'),
  ('A', 'MRI', 'P-POOJA',  7, null, 'waiting'),
  ('A', 'MRI', 'P-HARISH', 8, null, 'waiting'),
  ('A', 'CT',  'P-GEETA',  1, ((d + 9) + time '09:30') at time zone 'Asia/Kolkata', 'booked'),
  ('A', 'CT',  'P-RAMPR',  2, null, 'waiting');

  return '{"ok":true}';
end $$;

select tb.reset_demo();
