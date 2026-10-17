$port = 8080
$prefix = "http://localhost:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Server running at $prefix"

$baseDir = $PSScriptRoot
$dbFile = Join-Path $baseDir "database_history.json"
if (-not (Test-Path $dbFile)) {
    [System.IO.File]::WriteAllText($dbFile, "[]", [System.Text.Encoding]::UTF8)
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # Enable CORS
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        $response.AddHeader("Access-Control-Allow-Headers", "Content-Type")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        $rawUrl = $request.Url.LocalPath
        if ($rawUrl -eq "/api/history") {
            if ($request.HttpMethod -eq "GET") {
                if (-not (Test-Path $dbFile)) {
                    [System.IO.File]::WriteAllText($dbFile, "[]", [System.Text.Encoding]::UTF8)
                }
                $bytes = [System.IO.File]::ReadAllBytes($dbFile)
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.Close()
                continue
            }
            elseif ($request.HttpMethod -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                $reader.Close()

                if ($body -and $body.Trim().Length -gt 0) {
                    $existingText = "[]"
                    if (Test-Path $dbFile) {
                        $existingText = [System.IO.File]::ReadAllText($dbFile, [System.Text.Encoding]::UTF8)
                        if (-not $existingText -or $existingText.Trim().Length -eq 0) {
                            $existingText = "[]"
                        }
                    }

                    try {
                        $existingList = $existingText | ConvertFrom-Json
                        if ($existingList -eq $null) { $existingList = @() }
                        if ($existingList -isnot [System.Collections.IEnumerable] -or $existingList -is [string]) {
                            $existingList = @($existingList)
                        }
                    } catch {
                        $existingList = @()
                    }

                    try {
                        $newRecord = $body | ConvertFrom-Json
                        $filtered = @()
                        $rNew = "1"
                        if ($newRecord.round) {
                            $m = [regex]::Match([string]$newRecord.round, '\d+')
                            if ($m.Success) { $rNew = $m.Value }
                        } elseif ($newRecord.roundName) {
                            $m = [regex]::Match([string]$newRecord.roundName, '\d+')
                            if ($m.Success) { $rNew = $m.Value }
                        }
                        $fNew = if ($newRecord.formType) { [string]$newRecord.formType } else { "form1" }
                        $tNew = if ($newRecord.teacherName) { $newRecord.teacherName.Trim() } else { "" }

                        foreach ($item in $existingList) {
                            $rItem = "1"
                            if ($item.round) {
                                $m = [regex]::Match([string]$item.round, '\d+')
                                if ($m.Success) { $rItem = $m.Value }
                            } elseif ($item.roundName) {
                                $m = [regex]::Match([string]$item.roundName, '\d+')
                                if ($m.Success) { $rItem = $m.Value }
                            }
                            $fItem = if ($item.formType) { [string]$item.formType } else { "form1" }
                            $tItem = if ($item.teacherName) { $item.teacherName.Trim() } else { "" }

                            $isSame = ($item.id -and $newRecord.id -and $item.id -eq $newRecord.id) -or `
                                      ($tItem -and $tNew -and $tItem -eq $tNew -and $fItem -eq $fNew -and $rItem -eq $rNew)
                            if (-not $isSame) {
                                $filtered += $item
                            }
                        }
                        $all = @($newRecord) + $filtered
                        $outJson = $all | ConvertTo-Json -Depth 10
                        if ($all.Count -eq 1 -and -not $outJson.TrimStart().StartsWith("[")) {
                            $outJson = "[" + $outJson + "]"
                        }
                        [System.IO.File]::WriteAllText($dbFile, $outJson, [System.Text.Encoding]::UTF8)
                    } catch {
                        # fallback
                    }
                }

                $respBytes = [System.Text.Encoding]::UTF8.GetBytes('{"status":"success"}')
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $respBytes.Length
                $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
                $response.Close()
                continue
            }
            elseif ($request.HttpMethod -eq "DELETE") {
                $id = $request.QueryString["id"]
                if ($id -and (Test-Path $dbFile)) {
                    try {
                        $existingText = [System.IO.File]::ReadAllText($dbFile, [System.Text.Encoding]::UTF8)
                        $existingList = $existingText | ConvertFrom-Json
                        if ($existingList -ne $null) {
                            $filtered = @()
                            foreach ($item in $existingList) {
                                if ($item.id -ne $id) {
                                    $filtered += $item
                                }
                            }
                            if ($filtered.Count -eq 0) {
                                $outJson = "[]"
                            } else {
                                $outJson = $filtered | ConvertTo-Json -Depth 10
                                if ($filtered.Count -eq 1 -and -not $outJson.TrimStart().StartsWith("[")) {
                                    $outJson = "[" + $outJson + "]"
                                }
                            }
                            [System.IO.File]::WriteAllText($dbFile, $outJson, [System.Text.Encoding]::UTF8)
                        }
                    } catch {}
                }
                $respBytes = [System.Text.Encoding]::UTF8.GetBytes('{"status":"deleted"}')
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $respBytes.Length
                $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
                $response.Close()
                continue
            }
        }

        # Static file handling
        if ($rawUrl -eq "/" -or $rawUrl -eq "") {
            $rawUrl = "/index.html"
        }

        $decodedUrl = [System.Uri]::UnescapeDataString($rawUrl)
        $filePath = Join-Path $baseDir $decodedUrl.TrimStart('/')

        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = "application/octet-stream"
            if ($ext -eq ".html") { $mime = "text/html; charset=utf-8" }
            elseif ($ext -eq ".css") { $mime = "text/css; charset=utf-8" }
            elseif ($ext -eq ".js") { $mime = "application/javascript; charset=utf-8" }
            elseif ($ext -eq ".json") { $mime = "application/json; charset=utf-8" }
            elseif ($ext -eq ".svg") { $mime = "image/svg+xml" }
            elseif ($ext -eq ".png") { $mime = "image/png" }
            elseif ($ext -eq ".jpg" -or $ext -eq ".jpeg") { $mime = "image/jpeg" }
            elseif ($ext -eq ".webp") { $mime = "image/webp" }

            $response.ContentType = $mime
            $response.ContentLength64 = $bytes.Length
            if ($request.HttpMethod -ne "HEAD") {
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            if ($request.HttpMethod -ne "HEAD") {
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
        }
        $response.Close()
    } catch {
        # continue
    }
}
