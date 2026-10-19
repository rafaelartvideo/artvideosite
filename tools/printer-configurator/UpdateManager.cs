using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace UnionWorld.Printers;

// O canal de atualizacao usa SOMENTE o release oficial do repositorio.
// A verificacao SHA-256 detecta arquivos alterados ou incompletos.
// Sem assinatura de codigo, ela NAO substitui autenticacao do editor do software.
internal sealed record RemoteBuild(Version Version, string Url, string Sha256, long Size);

internal static class UpdateManager
{
    private const string ReleaseApi = "https://api.github.com/repos/rafaelartvideo/artvideosite/releases/tags/union-printer-configurator";
    private const string AssetUrl = "https://github.com/rafaelartvideo/artvideosite/releases/download/union-printer-configurator/UnionWorld-Configurador.exe";
    private const string AssetName = "UnionWorld-Configurador.exe";
    private const long MaxDownload = 300L * 1024 * 1024;
    private static readonly string UpdateDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "UnionWorld", "PrinterConfigurator", "updates");

    public static Version CurrentVersion =>
        Assembly.GetExecutingAssembly().GetName().Version ?? new Version(1, 0, 0, 0);

    private static Version Normalized(Version value) => new(
        value.Major, value.Minor, Math.Max(0, value.Build), Math.Max(0, value.Revision));

    public static async Task<RemoteBuild?> FindNewerAsync()
    {
        using HttpClient client = new() { Timeout = TimeSpan.FromSeconds(18) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("UnionWorldPrinterConfigurator/1.0");
        client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        using HttpResponseMessage response = await client.GetAsync(ReleaseApi, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();
        await using Stream content = await response.Content.ReadAsStreamAsync();
        using JsonDocument release = await JsonDocument.ParseAsync(content);
        if (!release.RootElement.TryGetProperty("assets", out JsonElement assets)
            || assets.ValueKind != JsonValueKind.Array)
            throw new InvalidDataException("O GitHub não retornou os arquivos da atualização.");

        foreach (JsonElement asset in assets.EnumerateArray())
        {
            if (asset.GetProperty("name").GetString() != AssetName) continue;
            string? label = asset.TryGetProperty("label", out var labelValue)
                && labelValue.ValueKind == JsonValueKind.String ? labelValue.GetString() : null;
            if (!Version.TryParse(label, out Version? remoteVersion))
                throw new InvalidDataException("A versão publicada não está identificada. Tente novamente mais tarde.");

            long size = asset.GetProperty("size").GetInt64();
            if (size <= 0 || size > MaxDownload)
                throw new InvalidDataException("O tamanho da atualização não é válido.");
            string? digest = asset.GetProperty("digest").GetString();
            if (digest is null || !Regex.IsMatch(digest, @"\Asha256:[0-9a-fA-F]{64}\z"))
                throw new InvalidDataException("O arquivo publicado não possui SHA-256 válido.");
            string? url = asset.GetProperty("browser_download_url").GetString();
            if (url != AssetUrl)
                throw new InvalidDataException("O link de atualização não corresponde ao repositório oficial.");

            Version normalizedRemote = Normalized(remoteVersion);
            if (normalizedRemote.CompareTo(Normalized(CurrentVersion)) <= 0) return null;
            return new RemoteBuild(normalizedRemote, url, digest[7..].ToLowerInvariant(), size);
        }
        throw new InvalidDataException("O executável não foi encontrado no release oficial.");
    }

    public static async Task<string> DownloadVerifiedAsync(RemoteBuild build, IProgress<int>? progress)
    {
        if (build.Url != AssetUrl || build.Size <= 0 || build.Size > MaxDownload
            || !Regex.IsMatch(build.Sha256, @"\A[0-9a-f]{64}\z"))
            throw new InvalidDataException("Metadados de atualização inválidos.");

        Directory.CreateDirectory(UpdateDirectory);
        string output = Path.Combine(UpdateDirectory, "UnionWorld-Configurador-" + Guid.NewGuid().ToString("N") + ".exe");
        try
        {
            using HttpClient client = new() { Timeout = TimeSpan.FromMinutes(12) };
            client.DefaultRequestHeaders.UserAgent.ParseAdd("UnionWorldPrinterConfigurator/1.0");
            using var response = await client.GetAsync(build.Url, HttpCompletionOption.ResponseHeadersRead);
            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength is long known && known != build.Size)
                throw new InvalidDataException("O tamanho do arquivo recebido diverge do release oficial.");

            await using Stream stream = await response.Content.ReadAsStreamAsync();
            await using (FileStream destination = new(output, FileMode.CreateNew, FileAccess.Write, FileShare.None, 128 * 1024, true))
            {
                byte[] buffer = new byte[128 * 1024];
                long downloaded = 0;
                int count;
                while ((count = await stream.ReadAsync(buffer)) > 0)
                {
                    downloaded += count;
                    if (downloaded > build.Size)
                        throw new InvalidDataException("O arquivo excede o tamanho autorizado.");
                    await destination.WriteAsync(buffer.AsMemory(0, count));
                    progress?.Report((int)(downloaded * 100 / build.Size));
                }
                if (downloaded != build.Size)
                    throw new InvalidDataException("O arquivo está incompleto.");
            }

            await using FileStream downloadedFile = File.OpenRead(output);
            byte[] hash = await SHA256.HashDataAsync(downloadedFile);
            string actual = Convert.ToHexString(hash).ToLowerInvariant();
            if (!string.Equals(actual, build.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("O SHA-256 do download não corresponde ao publicado no GitHub.");
            progress?.Report(100);
            return output;
        }
        catch
        {
            try { File.Delete(output); } catch { }
            throw;
        }
    }

    public static void StartInstaller(string verifiedPath, RemoteBuild build)
    {
        string current = Environment.ProcessPath
            ?? throw new InvalidOperationException("Não foi possível identificar o executável em execução.");
        if (!File.Exists(verifiedPath) || !IsWithinUpdateDirectory(verifiedPath))
            throw new InvalidOperationException("Arquivo temporário de atualização inválido.");
        ProcessStartInfo start = new(verifiedPath) {
            UseShellExecute = true,
            WorkingDirectory = Path.GetDirectoryName(verifiedPath)!
        };
        start.ArgumentList.Add("--apply-update");
        start.ArgumentList.Add(current);
        start.ArgumentList.Add(Environment.ProcessId.ToString());
        start.ArgumentList.Add(build.Sha256);
        if (Process.Start(start) is null)
            throw new InvalidOperationException("Não foi possível iniciar o atualizador.");
    }

    private static bool IsWithinUpdateDirectory(string path)
    {
        string basePath = Path.GetFullPath(UpdateDirectory).TrimEnd(Path.DirectorySeparatorChar)
            + Path.DirectorySeparatorChar;
        return Path.GetFullPath(path).StartsWith(basePath, StringComparison.OrdinalIgnoreCase);
    }

    // O novo EXE inicia em pasta temporária, espera o antigo terminar, troca o binário
    // e relança o caminho original. Não usa scripts externos e restaura o backup se falhar.
    public static void ApplyAfterExit(string[] args)
    {
        try
        {
            if (args.Length != 4 || args[0] != "--apply-update"
                || !int.TryParse(args[2], out int oldPid) || oldPid < 1
                || !Regex.IsMatch(args[3], @"\A[0-9a-f]{64}\z"))
                throw new InvalidDataException("Parâmetros do atualizador inválidos.");

            string source = Environment.ProcessPath
                ?? throw new InvalidOperationException("Arquivo de atualização não identificado.");
            string target = Path.GetFullPath(args[1]);
            string basename = Path.GetFileName(target);
            if (!IsWithinUpdateDirectory(source) || !File.Exists(source) || !File.Exists(target)
                || !basename.StartsWith("UnionWorld-Configurador", StringComparison.OrdinalIgnoreCase)
                || !basename.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                || string.Equals(source, target, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("O caminho de atualização é inválido.");

            using FileStream sourceForHash = File.OpenRead(source);
            string digest = Convert.ToHexString(SHA256.HashData(sourceForHash)).ToLowerInvariant();
            sourceForHash.Dispose();
            if (digest != args[3])
                throw new InvalidDataException("O executável temporário foi alterado após o download.");

            // Quando o aplicativo fecha muito rapidamente, o PID já pode não existir.
            Process? original = null;
            try { original = Process.GetProcessById(oldPid); }
            catch (ArgumentException) { /* Processo anterior já foi encerrado. */ }
            if (original is not null)
            {
                using (original)
                {
                    string? originalPath = original.MainModule?.FileName;
                    if (!string.Equals(Path.GetFullPath(originalPath ?? ""), target, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidDataException("O aplicativo que solicitou a atualização não corresponde ao destino.");
                    if (!original.WaitForExit(60_000))
                        throw new TimeoutException("O aplicativo antigo não foi fechado no tempo esperado.");
                }
            }

            string backup = target + ".previous";
            bool oldMoved = false;
            try
            {
                File.Move(target, backup, overwrite: true);
                oldMoved = true;
                File.Copy(source, target);
                if (Process.Start(new ProcessStartInfo(target) { UseShellExecute = true,
                    WorkingDirectory = Path.GetDirectoryName(target)! }) is null)
                    throw new IOException("Falha ao reiniciar o aplicativo atualizado.");
            }
            catch
            {
                if (oldMoved)
                {
                    try
                    {
                        if (File.Exists(target)) File.Delete(target);
                        File.Move(backup, target, overwrite: true);
                    }
                    catch { /* Preservar backup para recuperação manual. */ }
                }
                throw;
            }
        }
        catch (Exception error)
        {
            MessageBox.Show("Não foi possível concluir a atualização:\n" + error.Message
                + "\n\nO aplicativo anterior foi mantido ou salvo como .previous.",
                "Union World - Atualização", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
