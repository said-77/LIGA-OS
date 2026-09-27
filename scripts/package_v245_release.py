import os
import zipfile
import hashlib

def package_release():
    project_dir = os.path.abspath(".")
    release_dir = os.path.join(project_dir, "releases")
    os.makedirs(release_dir, exist_ok=True)
    output_zip = os.path.join(release_dir, "LIGA_OS_v2.4.5_ENTERPRISE_SEAL_RELEASE.zip")
    
    exclude_dirs = {'.git', '__pycache__', '.pytest_cache', '.vscode', 'node_modules', 'releases'}
    exclude_files = {'.DS_Store'}
    
    print(f"Creating release package: {output_zip}")
    file_count = 0
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(project_dir):
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            for file in files:
                if file in exclude_files or file.endswith('.pyc'):
                    continue
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, project_dir)
                zipf.write(file_path, rel_path)
                file_count += 1
                
    sha256 = hashlib.sha256()
    with open(output_zip, 'rb') as f:
        while chunk := f.read(65536):
            sha256.update(chunk)
            
    size_mb = os.path.getsize(output_zip) / (1024 * 1024)
    hash_val = sha256.hexdigest()
    print(f"Successfully packaged {file_count} files.")
    print(f"Archive Size: {size_mb:.2f} MB")
    print(f"SHA256: {hash_val}")

if __name__ == "__main__":
    package_release()
