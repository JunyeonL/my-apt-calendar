import importlib.util
import pathlib
import json
import os
import tempfile
import unittest
from unittest import mock

file=pathlib.Path(__file__).resolve().parents[1]/'scripts'/'fetch_applyhome.py'
spec=importlib.util.spec_from_file_location('fetch_applyhome',file)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class FetchTests(unittest.TestCase):
    def test_apt_area_comes_from_model_type_not_supply_area(self):
        self.assertEqual(mod.exclusive_area({'HOUSE_TY': '084.9409A', 'SUPLY_AR': '112.3'}), 84.9409)
        self.assertEqual(mod.exclusive_area({'HOUSE_TY': '059.9900', 'EXCLUSE_AR': '59.99'}), 59.99)
        self.assertIsNone(mod.exclusive_area({'HOUSE_TY': '미정', 'SUPLY_AR': '112.3'}))
        self.assertIsNone(mod.exclusive_area({'HOUSE_TY': '000.0000'}))

    def test_filtered_pagination_uses_match_count(self):
        response = {'data': [{'HOUSE_MANAGE_NO': 1}], 'totalCount': 9999, 'matchCount': 1}
        with mock.patch.object(mod, 'query', return_value=response) as query:
            result = mod.fetch_all('detail', 'test-key', {'cond[RCRIT_PBLANC_DE::GTE]': '2026-01-01'})
        self.assertEqual(len(result), 1)
        query.assert_called_once_with('detail', 'test-key', 1, {'cond[RCRIT_PBLANC_DE::GTE]': '2026-01-01'})

    def test_truncated_pagination_fails(self):
        responses = [{'data': [{'id': 1}], 'matchCount': 2}, {'data': [], 'matchCount': 2}]
        with mock.patch.object(mod, 'query', side_effect=responses):
            with self.assertRaisesRegex(RuntimeError, 'incomplete response'):
                mod.fetch_all('detail', 'test-key')

    def test_api_errors_do_not_expose_request_key(self):
        secret = 'dummy-secret-only-for-test'
        error = mod.urllib.error.URLError('https://api.example/?serviceKey=' + secret)
        with mock.patch.object(mod.urllib.request, 'urlopen', side_effect=error), mock.patch.object(mod.time, 'sleep'):
            with self.assertRaises(RuntimeError) as raised:
                mod.query('detail', secret, 1)
        self.assertNotIn(secret, str(raised.exception))

    def test_missing_key_preserves_dataset(self):
        with tempfile.TemporaryDirectory() as folder:
            dest = pathlib.Path(folder) / 'listings.json'
            dest.write_bytes(b'previous dataset')
            with mock.patch.object(mod, 'DEST', dest), mock.patch.dict(os.environ, {'DATA_GO_KR_API_KEY': ''}):
                self.assertEqual(mod.main(), 2)
            self.assertEqual(dest.read_bytes(), b'previous dataset')

    def test_partial_fetch_failure_preserves_dataset(self):
        with tempfile.TemporaryDirectory() as folder:
            dest = pathlib.Path(folder) / 'listings.json'
            dest.write_bytes(b'previous dataset')
            with mock.patch.object(mod, 'DEST', dest), mock.patch.dict(os.environ, {'DATA_GO_KR_API_KEY': 'dummy'}), mock.patch.object(mod, 'fetch_all', side_effect=[[], RuntimeError('API unavailable')]):
                with self.assertRaises(RuntimeError):
                    mod.main()
            self.assertEqual(dest.read_bytes(), b'previous dataset')

    def test_collection_decodes_key_and_publishes_only_public_fields(self):
        today = mod.dt.datetime.now(mod.ZoneInfo('Asia/Seoul')).date().isoformat()
        row = {'HOUSE_MANAGE_NO': 42, 'PBLANC_NO': 49, 'HOUSE_NM': '테스트 공고', 'RCRIT_PBLANC_DE': today, 'serviceKey': 'private'}
        with tempfile.TemporaryDirectory() as folder:
            dest = pathlib.Path(folder) / 'data' / 'listings.json'
            with mock.patch.object(mod, 'DEST', dest), mock.patch.dict(os.environ, {'DATA_GO_KR_API_KEY': 'dummy%2Bkey%3D'}), mock.patch.object(mod, 'fetch_all', side_effect=[[row], [], [], []]) as fetch:
                self.assertEqual(mod.main(), 0)
            self.assertEqual(fetch.call_args_list[0].args[1], 'dummy+key=')
            self.assertIn('cond[RCRIT_PBLANC_DE::GTE]', fetch.call_args_list[0].args[2])
            payload = json.loads(dest.read_text())
            self.assertEqual(len(payload['items']), 1)
            self.assertNotIn('serviceKey', dest.read_text())
            self.assertNotIn('dummy', dest.read_text())
            self.assertFalse(dest.with_suffix('.json.tmp').exists())

    def test_date(self):
        self.assertEqual(mod.date('20261119'),'2026-11-19')
        self.assertIsNone(mod.date('not a date'))

    def test_normalization(self):
        row={'HOUSE_MANAGE_NO':42,'PBLANC_NO':49,'HOUSE_NM':'테스트 단지',
             'SUBSCRPT_AREA_CODE_NM':'경기','HSSPLY_ADRES':'경기도 용인시',
             'RCRIT_PBLANC_DE':'2026-11-19',
             'SPSPLY_RCEPT_BGNDE':'2026-11-22',
             'PBLANC_URL':'https://www.applyhome.co.kr/ai/aia/test.do?foo=1'}
        models={('42','49'):[{'HOUSE_TY':'084','EXCLUSE_AR':'84.0','LTTOT_TOP_AMOUNT':'82000'}]}
        norm=mod.normalize(row,'apt',models)
        self.assertEqual(norm['models'][0]['priceManwon'],82000)
        self.assertEqual(norm['dates']['SPSPLY_RCEPT_BGNDE'],'2026-11-22')
        self.assertEqual(norm['region'],'경기')
        self.assertTrue(norm['url'].startswith('https://www.applyhome.co.kr/'))
        row['PBLANC_URL']='https://evil.example/steal'
        self.assertIsNone(mod.normalize(row,'apt',models)['url'])

if __name__=='__main__':unittest.main()
