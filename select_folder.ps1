Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = "Select Movie Folder"
$f.ShowNewFolderButton = $false
$result = $f.ShowDialog()
if ($result -eq "OK") {
    Write-Output $f.SelectedPath
}
