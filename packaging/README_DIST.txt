NB PDF PLARTFORM — Windows distribution checklist
==============================================

1) Version bump
   - Edit src/version_info.py (__version__)
   - Sync packaging/version_file.txt (FileVersion / ProductVersion strings and filevers tuple)
   - Sync installer/NB_PDF_PLARTFORM.iss (#define MyAppVersion)

2) Icon
   - assets/nb_pdf_PLARTFORM_icon.png is the source art
   - Regenerate ICO:  python scripts/png_to_ico.py
   - Produces assets/nb_pdf_PLARTFORM_icon.ico (used by PyInstaller and Inno Setup)

3) Build standalone EXE
   - From repo root (with requirements.txt installed):
     pip install -r requirements-build.txt
     pyinstaller --noconfirm packaging/nb_pdf_PLARTFORM.spec
   - Output: dist/NB_PDF_PLARTFORM.exe (windowed, one file)

4) Build installer EXE (optional)
   - Install Inno Setup 6
   - Build step 3 first
   - Run:  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\NB_PDF_PLARTFORM.iss
   - Output: dist_installer/NB_PDF_PLARTFORM_Setup_1.0.0.exe (version from .iss)

5) Auto-updates (optional)
   - Host a JSON manifest (see config/update-manifest.example.json)
   - Set update_manifest_url in desktop_auth_config.json or NB_UPDATE_MANIFEST_URL
   - Users can use Settings → Check for updates

6) Customer config
   - Ship desktop_auth_config.example.json as a template; customers copy to desktop_auth_config.json
   - Point api_base_url and web_app_url at your production API and web app
