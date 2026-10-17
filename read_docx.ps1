Add-Type -AssemblyName System.IO.Compression.FileSystem

$file = Get-ChildItem -Path . -Filter '*Observation*.docx' | Select-Object -First 1
$zip = [System.IO.Compression.ZipFile]::OpenRead($file.FullName)
$entry = $zip.GetEntry('word/document.xml')
$stream = $entry.Open()
$reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
$xml = $reader.ReadToEnd()
$stream.Close()
$zip.Dispose()

$pMatches = [regex]::Matches($xml, '<w:p[ >].*?</w:p>')
Write-Host "Total paragraphs: $($pMatches.Count)"
for ($i = 0; $i -lt 15; $i++) {
    Write-Host "--- P $i ---"
    Write-Host $pMatches[$i].Value
}
