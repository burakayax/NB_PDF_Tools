import os
import sys
import tempfile
import unittest
from unittest.mock import patch, Mock

# Ensure project src is importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# import the engine
import pdf_engine as pdf_engine

class TestPdfEngine(unittest.TestCase):
    def test_get_num_pages_success(self):
        fake_reader = Mock()
        fake_reader.pages = [1, 2, 3, 4, 5]
        with patch('PyPDF2.PdfReader', return_value=fake_reader):
            n = pdf_engine.get_num_pages('dummy.pdf')
            self.assertEqual(n, 5)

    def test_merge_pdfs_missing_file_raises(self):
        # Simulate first file missing
        with patch('os.path.isfile', side_effect=lambda p: False):
            with self.assertRaises(Exception) as cm:
                pdf_engine.merge_pdfs(['no_such.pdf'], 'out.pdf')
            self.assertIn('Birleştirilecek dosya bulunamadı', str(cm.exception))

    def test_merge_pdfs_success(self):
        mock_merger = Mock()
        mock_merger.append = Mock()
        mock_merger.write = Mock()
        mock_merger.close = Mock()

        with patch('os.path.isfile', return_value=True):
            with patch('PyPDF2.PdfMerger', return_value=mock_merger) as m:
                res = pdf_engine.merge_pdfs(['a.pdf', 'b.pdf'], 'out.pdf')
                self.assertTrue(res)
                self.assertEqual(mock_merger.append.call_count, 2)
                mock_merger.write.assert_called_once_with('out.pdf')
                mock_merger.close.assert_called_once()

    def test_extract_pages_invalid_page_raises(self):
        fake_reader = Mock()
        fake_reader.pages = [Mock(), Mock(), Mock()]  # 3 pages
        with patch('PyPDF2.PdfReader', return_value=fake_reader):
            with self.assertRaises(Exception) as cm:
                pdf_engine.extract_pages('in.pdf', [0], 'out.pdf')
            self.assertIn('Geçersiz sayfa numarası', str(cm.exception))

    def test_extract_pages_success(self):
        fake_reader = Mock()
        fake_reader.pages = [b'p1', b'p2', b'p3']

        fake_writer = Mock()
        fake_writer.add_page = Mock()
        fake_writer.write = Mock()

        with patch('PyPDF2.PdfReader', return_value=fake_reader):
            with patch('PyPDF2.PdfWriter', return_value=fake_writer):
                with tempfile.TemporaryDirectory() as tmpdir:
                    out_path = os.path.join(tmpdir, 'out.pdf')
                    res = pdf_engine.extract_pages('in.pdf', [1,3], out_path)
                    self.assertTrue(res)
                    # add_page called twice
                    self.assertEqual(fake_writer.add_page.call_count, 2)
                    # write called with a file-like object
                    fake_writer.write.assert_called()

    def test_extract_pages_separate_success(self):
        fake_reader = Mock()
        fake_reader.pages = [b'p1', b'p2', b'p3']

        fake_writer = Mock()
        fake_writer.add_page = Mock()
        fake_writer.write = Mock()

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch('os.path.isdir', return_value=True):
                with patch('PyPDF2.PdfReader', return_value=fake_reader):
                    with patch('PyPDF2.PdfWriter', return_value=fake_writer):
                        paths = pdf_engine.extract_pages_separate('in.pdf', [1,2], tmpdir)
                        self.assertEqual(len(paths), 2)
                        for p in paths:
                            self.assertTrue(p.endswith('.pdf'))

if __name__ == '__main__':
    unittest.main()
