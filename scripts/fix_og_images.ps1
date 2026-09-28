Add-Type -AssemblyName System.Drawing

$rootDir = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $rootDir "icons\og-preview.png"
$jpgPath = Join-Path $rootDir "icons\og-preview.jpg"
$tempPngPath = Join-Path $rootDir "icons\og-preview-temp.png"

Write-Output "Source path: $sourcePath"

if (-not (Test-Path $sourcePath)) {
    Write-Error "Source file not found!"
    exit 1
}

$img = [System.Drawing.Image]::FromFile($sourcePath)

# Сохраняем честный JPG
$img.Save($jpgPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
Write-Output "Created: $jpgPath"

# Создаем честный PNG
$bmp = New-Object System.Drawing.Bitmap($img)
$bmp.Save($tempPngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Created: $tempPngPath"

$img.Dispose()
$bmp.Dispose()

# Заменяем og-preview.png на честный PNG
Move-Item -Force $tempPngPath $sourcePath
Write-Output "Successfully updated $sourcePath with true PNG format!"
