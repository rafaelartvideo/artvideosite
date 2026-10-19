using System.ComponentModel;
using System.Globalization;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace UnionWorld.Printers;

internal sealed class PrinterProfile
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Manufacturer { get; set; } = "";
    public List<string> Match { get; set; } = new();
    public decimal PaperWidthMm { get; set; }
    public decimal PaperHeightMm { get; set; }
    public string DriverUrl { get; set; } = "";
    public string Description { get; set; } = "";
    public override string ToString() => Name;
}

internal sealed class ProfileRegistry
{
    public int SchemaVersion { get; set; }
    public List<PrinterProfile> Profiles { get; set; } = new();
}

internal static class Profiles
{
    private static readonly JsonSerializerOptions Options = new() { PropertyNameCaseInsensitive = true };
    private const string Url = "https://unionworld.com.br/assets/crm/impressoras/perfis.json";

    private static ProfileRegistry Validate(ProfileRegistry? registry)
    {
        if (registry is null || registry.SchemaVersion != 1 || registry.Profiles is null ||
            registry.Profiles.Count < 1 || registry.Profiles.Count > 100)
            throw new InvalidDataException("Catalogo de impressoras invalido.");
        HashSet<string> seen = new(StringComparer.OrdinalIgnoreCase);
        foreach (var profile in registry.Profiles)
        {
            if (profile.Id.Length is < 1 or > 48 ||
                !profile.Id.All(ch => char.IsAsciiLetterOrDigit(ch) || ch == '-') ||
                !seen.Add(profile.Id) ||
                profile.Name.Length is < 2 or > 110 ||
                profile.PaperWidthMm is < 5 or > 500 ||
                profile.PaperHeightMm is < 5 or > 500 ||
                profile.Match is null || profile.Match.Count > 10 ||
                profile.Match.Any(token => token.Length is < 2 or > 50))
                throw new InvalidDataException("Perfil de impressora invalido.");
            if (profile.DriverUrl.Length != 0 && !profile.DriverUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Link de driver nao seguro.");
        }
        return registry;
    }

    public static ProfileRegistry Offline()
    {
        using Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("union-printer-profiles.json")
            ?? throw new InvalidOperationException("Catalogo interno nao encontrado.");
        return Validate(JsonSerializer.Deserialize<ProfileRegistry>(stream, Options));
    }

    public static async Task<(ProfileRegistry Registry, bool Updated)> UpdateAsync()
    {
        try
        {
            using HttpClient http = new() { Timeout = TimeSpan.FromSeconds(7) };
            using HttpResponseMessage response = await http.GetAsync(Url, HttpCompletionOption.ResponseHeadersRead);
            response.EnsureSuccessStatusCode();
            await using Stream stream = await response.Content.ReadAsStreamAsync();
            return (Validate(await JsonSerializer.DeserializeAsync<ProfileRegistry>(stream, Options)), true);
        }
        catch { return (Offline(), false); }
    }
}

internal static class WindowsForms
{
    private const int ServerAccessAdminister = 0x1;
    [StructLayout(LayoutKind.Sequential)]
    private struct NativeSize { public int cx; public int cy; }
    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect { public int left; public int top; public int right; public int bottom; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct FormInfo
    {
        public int Flags;
        [MarshalAs(UnmanagedType.LPWStr)] public string pName;
        public NativeSize Size;
        public NativeRect ImageableArea;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct PrinterDefaults
    {
        public IntPtr pDatatype;
        public IntPtr pDevMode;
        public int DesiredAccess;
    }
    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool OpenPrinter(string? server, out IntPtr handle, ref PrinterDefaults defaults);
    [DllImport("winspool.drv", EntryPoint = "AddFormW", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AddForm(IntPtr handle, int level, ref FormInfo form);
    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ClosePrinter(IntPtr handle);

    public static (string Name, bool Created) RegisterPaper(decimal width, decimal height)
    {
        if (width is < 5 or > 500 || height is < 5 or > 500)
            throw new ArgumentOutOfRangeException(nameof(width), "Medidas fora do intervalo (5 a 500 mm).");
        string name = "Union " + width.ToString("0.##", CultureInfo.InvariantCulture) +
            "x" + height.ToString("0.##", CultureInfo.InvariantCulture) + " mm";
        if (name.Length > 31) throw new InvalidOperationException("Nome de papel muito longo.");
        int w = checked((int)(width * 1000m));
        int h = checked((int)(height * 1000m));
        var defaults = new PrinterDefaults { DesiredAccess = ServerAccessAdminister };
        if (!OpenPrinter(null, out IntPtr spooler, ref defaults))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Nao foi possivel acessar o servidor de impressao como administrador.");
        try
        {
            var form = new FormInfo {
                pName = name,
                Size = new NativeSize { cx = w, cy = h },
                ImageableArea = new NativeRect { right = w, bottom = h }
            };
            if (AddForm(spooler, 1, ref form)) return (name, true);
            int error = Marshal.GetLastWin32Error();
            if (error is 80 or 183) return (name, false);
            throw new Win32Exception(error, "O Windows recusou cadastrar este formato de papel.");
        }
        finally { ClosePrinter(spooler); }
    }
}
