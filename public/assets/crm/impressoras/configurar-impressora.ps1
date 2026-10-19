# Union World - Configurador de impressoras para Windows 10/11
# Script local e legivel; nao baixa drivers nem executaveis.
# Perfil: @@MODEL_LABEL@@; papel: @@WIDTH_MM@@ x @@HEIGHT_MM@@ mm
$ErrorActionPreference = 'Stop'
$printerPattern = '@@MODEL_MATCH@@'
$formName = '@@FORM_NAME@@'
$widthUnits = @@WIDTH_UNITS@@
$heightUnits = @@HEIGHT_UNITS@@

function Finish([string]$message, [int]$exitCode = 0) {
  Write-Host ""
  Write-Host $message
  Read-Host "Pressione Enter para fechar" | Out-Null
  exit $exitCode
}

try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $isAdmin = ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    Write-Host "O Windows pedira permissao para registrar o papel."
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'))
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments -Wait
    exit 0
  }

  Import-Module PrintManagement -ErrorAction Stop
  $foundPrinters = @(Get-Printer -ErrorAction Stop | Where-Object { ($_.Name + " " + $_.DriverName) -match $printerPattern } | Sort-Object Name)
  Write-Host "=== Union World - Configurador de impressoras ==="
  Write-Host "Modelo: @@MODEL_LABEL@@"
  Write-Host "Papel: $formName"
  if ($foundPrinters.Count -eq 0) {
    Finish "Impressora nao encontrada. Instale o driver oficial, conecte via USB e tente novamente." 2
  }
  if ($foundPrinters.Count -eq 1) {
    $chosen = $foundPrinters[0]
  } else {
    Write-Host "Impressoras compativeis:"
    for ($i = 0; $i -lt $foundPrinters.Count; $i++) {
      Write-Host "$($i + 1). $($foundPrinters[$i].Name) - $($foundPrinters[$i].DriverName)"
    }
    $answer = Read-Host "Digite o numero da impressora"
    $number = 0
    if (-not [int]::TryParse($answer, [ref]$number) -or $number -lt 1 -or $number -gt $foundPrinters.Count) {
      Finish "Selecao invalida. Nada foi alterado." 1
    }
    $chosen = $foundPrinters[$number - 1]
  }

  Write-Host "Impressora: $($chosen.Name)"
  Write-Host "Driver: $($chosen.DriverName)"
  $confirmed = Read-Host "Cadastrar $formName ($($widthUnits / 1000) x $($heightUnits / 1000) mm)? (S/N)"
  if ($confirmed -notmatch '^[sS]$') { Finish "Cancelado; nada foi alterado." }

  # AddForm FORM_INFO_1 espera as dimensoes em milesimos de milimetro.
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class UnionPrintForms {
  [StructLayout(LayoutKind.Sequential)] public struct SIZEL { public int cx; public int cy; }
  [StructLayout(LayoutKind.Sequential)] public struct RECTL { public int left; public int top; public int right; public int bottom; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct FORM_INFO_1 {
    public int Flags;
    [MarshalAs(UnmanagedType.LPWStr)] public string pName;
    public SIZEL Size;
    public RECTL ImageableArea;
  }
  [StructLayout(LayoutKind.Sequential)] public struct PRINTER_DEFAULTS {
    public IntPtr pDatatype;
    public IntPtr pDevMode;
    public int DesiredAccess;
  }
  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", CharSet=CharSet.Unicode, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool OpenPrinter(string printerName, out IntPtr handle, ref PRINTER_DEFAULTS defaults);
  [DllImport("winspool.drv", EntryPoint="AddFormW", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool AddForm(IntPtr handle, int level, ref FORM_INFO_1 form);
  [DllImport("winspool.drv", EntryPoint="ClosePrinter", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool ClosePrinter(IntPtr handle);
}
'@ -ErrorAction Stop

  $handle = [IntPtr]::Zero
  # Formularios personalizados sao registrados no spooler local, nao na porta USB.
  $defaults = New-Object UnionPrintForms+PRINTER_DEFAULTS
  $defaults.DesiredAccess = 0x00000001 # SERVER_ACCESS_ADMINISTER
  if (-not [UnionPrintForms]::OpenPrinter($null, [ref]$handle, [ref]$defaults)) {
    throw "Nao foi possivel abrir o servidor local de impressao como administrador. Codigo $([Runtime.InteropServices.Marshal]::GetLastWin32Error())."
  }
  try {
    $form = New-Object UnionPrintForms+FORM_INFO_1
    $form.Flags = 0
    $form.pName = $formName
    $size = New-Object UnionPrintForms+SIZEL
    $size.cx = $widthUnits
    $size.cy = $heightUnits
    $form.Size = $size
    $rectangle = New-Object UnionPrintForms+RECTL
    $rectangle.left = 0
    $rectangle.top = 0
    $rectangle.right = $widthUnits
    $rectangle.bottom = $heightUnits
    $form.ImageableArea = $rectangle
    if ([UnionPrintForms]::AddForm($handle, 1, [ref]$form)) {
      Write-Host "Papel cadastrado no Windows." -ForegroundColor Green
    } else {
      $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
      if ($code -in @(80, 183)) {
        Write-Host "O papel ja estava cadastrado no Windows." -ForegroundColor Green
      } else {
        throw "Nao foi possivel cadastrar o papel (codigo $code). Confira driver e permissoes."
      }
    }
  } finally {
    [UnionPrintForms]::ClosePrinter($handle) | Out-Null
  }

  Write-Host ""
  Write-Host "CONFIRMACAO NO DRIVER:"
  Write-Host "1. Abra Dispositivos e Impressoras > Preferencias de impressao."
  Write-Host "2. Selecione o papel '$formName' (ou configure o papel personalizado no driver)."
  Write-Host "3. Na Union World, imprima uma etiqueta de teste no Brave."
  Write-Host "4. Use escala 100%, sem margens e sem cabecalhos."
  Finish "Papel cadastrado. Verifique se o driver reconheceu o novo tamanho."
} catch {
  Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
  Finish "Verifique as instrucoes antes de repetir a operacao." 1
}
