using System.Diagnostics;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Globalization;
using System.Windows.Forms;

namespace UnionWorld.Printers;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new PrinterSetupWindow());
    }
}

internal sealed class PrinterSetupWindow : Form
{
    private static readonly Color Blue = Color.FromArgb(0, 87, 231);
    private static readonly Color Ink = Color.FromArgb(15, 29, 47);
    private static readonly Color Muted = Color.FromArgb(91, 107, 132);
    private readonly ComboBox queues = new() { DropDownStyle = ComboBoxStyle.DropDownList, MaxDropDownItems = 12 };
    private readonly ComboBox profiles = new() { DropDownStyle = ComboBoxStyle.DropDownList, MaxDropDownItems = 12 };
    private readonly NumericUpDown width = new() { Minimum = 5, Maximum = 500, DecimalPlaces = 2, Increment = 0.5m };
    private readonly NumericUpDown height = new() { Minimum = 5, Maximum = 500, DecimalPlaces = 2, Increment = 0.5m };
    private readonly Label origin = new() { AutoSize = true };
    private readonly Label description = new() { AutoSize = false };
    private readonly TextBox result = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, TabStop = false };
    private readonly Button apply = new() { Text = "Configurar papel" };
    private ProfileRegistry registry = Profiles.Offline();
    private bool loadingProfiles;

    public PrinterSetupWindow()
    {
        Text = "Union World - Configurador de Impressoras";
        ClientSize = new Size(856, 628);
        MinimumSize = new Size(820, 660);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(246, 248, 252);
        Font = new Font("Segoe UI", 10);
        AutoScaleMode = AutoScaleMode.Dpi;

        // Header e conteudo ocupam linhas diferentes: Dock.Fill nao pode ficar sob Dock.Top.
        // Desenhamos os textos na mesma superficie do gradiente para evitar os blocos brancos
        // de controles Label com fundo opaco em alguns Windows e configuracoes de DPI.
        var root = new TableLayoutPanel {
            Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1,
            Padding = Padding.Empty, Margin = Padding.Empty
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(root);

        var header = new Panel { Dock = DockStyle.Fill, Margin = Padding.Empty, BackColor = Blue };
        header.Paint += (_, e) => {
            if (header.Width <= 0 || header.Height <= 0) return;
            using var gradient = new LinearGradientBrush(header.ClientRectangle, Color.FromArgb(0, 66, 181), Blue, 0f);
            e.Graphics.FillRectangle(gradient, header.ClientRectangle);
            using var headingFont = new Font("Segoe UI", 20, FontStyle.Bold);
            using var subtitleFont = new Font("Segoe UI", 10);
            var commonFlags = TextFormatFlags.Left | TextFormatFlags.VerticalCenter |
                TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis;
            TextRenderer.DrawText(e.Graphics, "Configurador de Impressoras", headingFont,
                new Rectangle(24, 12, Math.Max(1, header.Width - 48), 45),
                Color.White, commonFlags);
            TextRenderer.DrawText(e.Graphics, "Selecione a impressora e prepare o papel para a Union World",
                subtitleFont, new Rectangle(26, 58, Math.Max(1, header.Width - 52), 29),
                Color.FromArgb(231, 239, 255), commonFlags);
        };
        root.Controls.Add(header, 0, 0);

        var container = new TableLayoutPanel {
            Dock = DockStyle.Fill, Margin = Padding.Empty,
            Padding = new Padding(20, 18, 20, 16), RowCount = 4, ColumnCount = 1
        };
        container.RowStyles.Add(new RowStyle(SizeType.Absolute, 178));
        container.RowStyles.Add(new RowStyle(SizeType.Absolute, 151));
        container.RowStyles.Add(new RowStyle(SizeType.Absolute, 67));
        container.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.Controls.Add(container, 0, 1);

        var printerCard = NewCard();
        container.Controls.Add(printerCard, 0, 0);
        printerCard.Controls.Add(NewLabel("1. Escolher impressora", 15, 12, 12, Ink, true));
        printerCard.Controls.Add(NewLabel("Impressoras instaladas neste Windows", 15, 45, 9, Muted));
        queues.SetBounds(15, 70, 602, 29);
        queues.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
        queues.SelectedIndexChanged += (_, _) => AutoSelectProfile();
        printerCard.Controls.Add(queues);
        var refresh = NewButton("Atualizar", Color.White, Ink);
        refresh.SetBounds(629, 69, 145, 30);
        refresh.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        refresh.Click += (_, _) => LoadPrinters();
        printerCard.Controls.Add(refresh);
        printerCard.Controls.Add(NewLabel("Perfil da impressora", 15, 113, 9, Muted));
        profiles.SetBounds(15, 138, 478, 28);
        profiles.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
        profiles.SelectedIndexChanged += (_, _) => ApplyProfile();
        printerCard.Controls.Add(profiles);
        origin.SetBounds(508, 144, 270, 22);
        origin.ForeColor = Muted;
        origin.Font = new Font("Segoe UI", 8);
        printerCard.Controls.Add(origin);

        var paperCard = NewCard();
        container.Controls.Add(paperCard, 0, 1);
        paperCard.Controls.Add(NewLabel("2. Tamanho do papel", 15, 12, 12, Ink, true));
        paperCard.Controls.Add(NewLabel("Largura (mm)", 15, 54, 9, Muted));
        paperCard.Controls.Add(NewLabel("Altura (mm)", 183, 54, 9, Muted));
        width.SetBounds(15, 79, 147, 30);
        height.SetBounds(183, 79, 147, 30);
        paperCard.Controls.Add(width);
        paperCard.Controls.Add(height);
        description.SetBounds(350, 60, 424, 64);
        description.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        description.ForeColor = Muted;
        description.Font = new Font("Segoe UI", 9);
        paperCard.Controls.Add(description);

        var actions = new Panel { Dock = DockStyle.Fill };
        container.Controls.Add(actions, 0, 2);
        apply.BackColor = Blue;
        apply.ForeColor = Color.White;
        apply.FlatStyle = FlatStyle.Flat;
        apply.FlatAppearance.BorderSize = 0;
        apply.Font = new Font("Segoe UI", 10, FontStyle.Bold);
        apply.SetBounds(0, 10, 244, 40);
        apply.Click += (_, _) => Register();
        actions.Controls.Add(apply);
        var preferences = NewButton("Preferências", Color.White, Ink);
        preferences.SetBounds(258, 10, 160, 40);
        preferences.Click += (_, _) => OpenPreferences();
        actions.Controls.Add(preferences);
        var officialDriver = NewButton("Driver do fabricante", Color.White, Ink);
        officialDriver.SetBounds(430, 10, 200, 40);
        officialDriver.Click += (_, _) => OpenDriver();
        actions.Controls.Add(officialDriver);

        var statusCard = NewCard();
        container.Controls.Add(statusCard, 0, 3);
        // O titulo tambem precisa ter sua propria linha; um painel Dock.Fill
        // sobre a etiqueta estava ocultando "3. Orientacoes e resultado".
        var statusLayout = new TableLayoutPanel {
            Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1,
            Padding = new Padding(15, 4, 15, 10), Margin = Padding.Empty
        };
        statusLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        statusLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var statusTitle = NewLabel("3. Orientações e resultado", 0, 0, 12, Ink, true);
        statusTitle.Dock = DockStyle.Fill;
        statusTitle.TextAlign = ContentAlignment.MiddleLeft;
        statusLayout.Controls.Add(statusTitle, 0, 0);
        result.Dock = DockStyle.Fill;
        result.Margin = Padding.Empty;
        result.BorderStyle = BorderStyle.None;
        result.BackColor = Color.White;
        result.ForeColor = Ink;
        result.Font = new Font("Segoe UI", 9);
        statusLayout.Controls.Add(result, 0, 1);
        statusCard.Controls.Add(statusLayout);
        SetStatus("Selecione uma impressora instalada. O aplicativo identifica modelos conhecidos pelo nome da fila.\r\n" +
            "Ao confirmar, cadastra o tamanho do papel no Windows. Alguns drivers exigem selecionar esse papel em Preferências de impressão.\r\n" +
            "Nenhuma outra impressora, driver, porta USB ou configuração padrão será alterada.");

        Shown += async (_, _) => {
            PopulateProfiles(registry, false);
            LoadPrinters();
            var updated = await Profiles.UpdateAsync();
            if (IsDisposed) return;
            string? previousId = (profiles.SelectedItem as PrinterProfile)?.Id;
            PopulateProfiles(updated.Registry, updated.Updated);
            if (previousId is not null)
            {
                var same = updated.Registry.Profiles.FirstOrDefault(p => p.Id == previousId);
                if (same is not null) profiles.SelectedItem = same;
            }
            AutoSelectProfile();
        };
    }

    private static Panel NewCard() => new() {
        Dock = DockStyle.Fill, Margin = new Padding(0, 0, 0, 10),
        BackColor = Color.White, BorderStyle = BorderStyle.FixedSingle
    };

    private static Label NewLabel(string text, int x, int y, float size, Color color, bool bold = false) => new() {
        Text = text, AutoSize = true, Location = new Point(x, y),
        ForeColor = color, Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular)
    };

    private static Button NewButton(string text, Color background, Color foreground) => new() {
        Text = text, BackColor = background, ForeColor = foreground,
        Font = new Font("Segoe UI", 9), FlatStyle = FlatStyle.Flat
    };

    private void SetStatus(string message) => result.Text = message;

    private void PopulateProfiles(ProfileRegistry next, bool fromWeb)
    {
        loadingProfiles = true;
        registry = next;
        profiles.Items.Clear();
        foreach (var profile in next.Profiles) profiles.Items.Add(profile);
        origin.Text = fromWeb ? "Catálogo atualizado pela Union" : "Catálogo integrado (offline)";
        loadingProfiles = false;
        AutoSelectProfile();
    }

    private void LoadPrinters()
    {
        try
        {
            string? previous = queues.SelectedItem as string;
            var names = PrinterSettings.InstalledPrinters.Cast<string>().OrderBy(x => x).ToArray();
            queues.Items.Clear();
            queues.Items.AddRange(names);
            if (names.Length > 0)
            {
                int found = Array.IndexOf(names, previous);
                queues.SelectedIndex = found >= 0 ? found : 0;
            }
            apply.Enabled = names.Length > 0;
            if (names.Length == 0)
                SetStatus("Nenhuma impressora encontrada. Instale o driver, conecte a impressora e pressione Atualizar.");
            AutoSelectProfile();
        }
        catch (Exception error)
        {
            apply.Enabled = false;
            SetStatus("Falha ao listar impressoras: " + error.Message);
        }
    }

    private void AutoSelectProfile()
    {
        if (loadingProfiles || queues.SelectedItem is not string selected) return;
        var profile = registry.Profiles.FirstOrDefault(p => p.Id != "custom" &&
            p.Match.Any(token => selected.Contains(token, StringComparison.OrdinalIgnoreCase)));
        profile ??= registry.Profiles.FirstOrDefault(p => p.Id == "custom");
        profile ??= registry.Profiles.FirstOrDefault();
        if (profile is not null) profiles.SelectedItem = profile;
    }

    private void ApplyProfile()
    {
        if (loadingProfiles || profiles.SelectedItem is not PrinterProfile profile) return;
        width.Value = Math.Clamp(profile.PaperWidthMm, width.Minimum, width.Maximum);
        height.Value = Math.Clamp(profile.PaperHeightMm, height.Minimum, height.Maximum);
        description.Text = profile.Description;
    }

    private void Register()
    {
        if (queues.SelectedItem is not string selected || profiles.SelectedItem is not PrinterProfile profile)
        {
            MessageBox.Show("Escolha a impressora e o perfil.", "Union World");
            return;
        }

        string measure = width.Value.ToString("0.##", CultureInfo.CurrentCulture) + " × " +
            height.Value.ToString("0.##", CultureInfo.CurrentCulture) + " mm";
        if (MessageBox.Show("Impressora: " + selected + "\nModelo: " + profile.Name + "\nPapel: " + measure +
            "\n\nDeseja cadastrar este papel no Windows?", "Confirmar", MessageBoxButtons.YesNo,
            MessageBoxIcon.Question) != DialogResult.Yes) return;

        try
        {
            var registered = WindowsForms.RegisterPaper(width.Value, height.Value);
            SetStatus((registered.Created ? "Papel cadastrado com sucesso!" : "Papel já cadastrado no Windows.") +
                "\r\nNome do formulário: " + registered.Name +
                "\r\nImpressora escolhida: " + selected + ". Tamanho: " + measure +
                "\r\nIMPORTANTE: o formato foi registrado no Windows, mas o driver pode não tê-lo selecionado automaticamente." +
                "\r\nClique Preferências e selecione o papel " + registered.Name +
                " (ou crie a mídia personalizada no menu Stocks/Papel do driver). Depois imprima uma etiqueta na Union com escala 100% e margens zero.");
            MessageBox.Show("Papel registrado. Confira a seleção do formato nas preferências do driver antes de imprimir.",
                "Union World", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception error)
        {
            SetStatus("Falha na configuração: " + error.Message);
            MessageBox.Show(error.Message, "Erro", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void OpenPreferences()
    {
        if (queues.SelectedItem is not string selected) return;
        try
        {
            var info = new ProcessStartInfo("rundll32.exe") { UseShellExecute = true };
            info.ArgumentList.Add("printui.dll,PrintUIEntry");
            info.ArgumentList.Add("/e");
            info.ArgumentList.Add("/n");
            info.ArgumentList.Add(selected);
            Process.Start(info);
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message + "\nTambém pode abrir Painel de Controle > Dispositivos e Impressoras.", "Union World");
        }
    }

    private void OpenDriver()
    {
        if (profiles.SelectedItem is not PrinterProfile profile || string.IsNullOrWhiteSpace(profile.DriverUrl))
        {
            MessageBox.Show("Para este modelo, obtenha o driver diretamente com o fabricante.", "Union World");
            return;
        }
        try { Process.Start(new ProcessStartInfo(profile.DriverUrl) { UseShellExecute = true }); }
        catch (Exception error) { MessageBox.Show(error.Message, "Union World"); }
    }
}
