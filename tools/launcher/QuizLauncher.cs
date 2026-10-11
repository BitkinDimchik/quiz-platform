using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Text.RegularExpressions;

internal static class Program
{
    const string NodeVer = "22.16.0";
    const string ZipName = "node-v" + NodeVer + "-win-x64.zip";
    const string ZipUrl = "https://nodejs.org/dist/v" + NodeVer + "/" + ZipName;

    static int Main()
    {
        var exeDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
        Directory.SetCurrentDirectory(exeDir);
        Console.Title = "quiz-platform";

        var bat = Path.Combine(exeDir, "start-prod.bat");
        if (!File.Exists(bat))
        {
            Console.WriteLine("  start-prod.bat not found next to Quiz.exe");
            Console.WriteLine("  Copy Quiz.exe into the quizzes folder.");
            Pause();
            return 1;
        }

        string nodeDir;
        try
        {
            nodeDir = EnsureNode(exeDir);
        }
        catch (Exception ex)
        {
            Console.WriteLine();
            Console.WriteLine("  Could not prepare Node.js: " + ex.Message);
            Console.WriteLine("  Install Node.js 22 LTS: https://nodejs.org");
            Pause();
            return 1;
        }

        var psi = new ProcessStartInfo();
        psi.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "cmd.exe");
        psi.Arguments = "/d /c call \"" + bat + "\"";
        psi.WorkingDirectory = exeDir;
        psi.UseShellExecute = false;
        if (!string.IsNullOrEmpty(nodeDir))
        {
            psi.EnvironmentVariables["PATH"] = nodeDir + ";" + Environment.GetEnvironmentVariable("PATH");
        }

        var p = Process.Start(psi);
        if (p == null)
        {
            Console.WriteLine("  Failed to start start-prod.bat");
            Pause();
            return 1;
        }
        p.WaitForExit();
        return p.ExitCode;
    }

    static string EnsureNode(string exeDir)
    {
        var portableDir = Path.Combine(exeDir, "runtime", "node");
        var portableExe = Path.Combine(portableDir, "node.exe");
        if (File.Exists(portableExe))
        {
            Console.WriteLine("  Using bundled Node.js: " + NodeVersion(portableExe));
            return portableDir;
        }

        int major = SystemNodeMajor();
        if (major == 20 || major == 22)
        {
            Console.WriteLine("  Using installed Node.js");
            return "";
        }

        if (major > 0)
        {
            Console.WriteLine("  Installed Node.js v" + major + " is not used for SQLite binaries.");
            Console.WriteLine("  Downloading Node.js " + NodeVer + " into runtime\\node ...");
        }
        else
        {
            Console.WriteLine("  Node.js not found. Downloading " + NodeVer + " into runtime\\node ...");
        }

        DownloadPortable(exeDir, portableDir);
        if (!File.Exists(portableExe))
        {
            throw new Exception("node.exe missing after download");
        }
        Console.WriteLine("  Bundled Node.js: " + NodeVersion(portableExe));
        return portableDir;
    }

    static int SystemNodeMajor()
    {
        try
        {
            var psi = new ProcessStartInfo("node", "-p process.versions.node");
            psi.UseShellExecute = false;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.CreateNoWindow = true;
            var p = Process.Start(psi);
            if (p == null) return 0;
            var text = p.StandardOutput.ReadToEnd();
            p.WaitForExit(8000);
            var m = Regex.Match(text ?? "", @"^(\d+)");
            if (!m.Success) return 0;
            return int.Parse(m.Groups[1].Value);
        }
        catch
        {
            return 0;
        }
    }

    static string NodeVersion(string nodeExe)
    {
        try
        {
            var psi = new ProcessStartInfo(nodeExe, "-v");
            psi.UseShellExecute = false;
            psi.RedirectStandardOutput = true;
            psi.CreateNoWindow = true;
            var p = Process.Start(psi);
            if (p == null) return "?";
            var text = (p.StandardOutput.ReadToEnd() ?? "").Trim();
            p.WaitForExit(8000);
            return text;
        }
        catch
        {
            return "?";
        }
    }

    static void DownloadPortable(string exeDir, string portableDir)
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        var runtime = Path.Combine(exeDir, "runtime");
        Directory.CreateDirectory(runtime);
        var zipPath = Path.Combine(runtime, ZipName);
        var extractDir = Path.Combine(runtime, "tmp-node");

        using (var wc = new WebClient())
        {
            wc.Headers.Add("User-Agent", "quiz-platform-launcher");
            wc.DownloadFile(ZipUrl, zipPath);
        }

        if (Directory.Exists(extractDir)) Directory.Delete(extractDir, true);
        ZipFile.ExtractToDirectory(zipPath, extractDir);

        var inner = Path.Combine(extractDir, "node-v" + NodeVer + "-win-x64");
        if (!Directory.Exists(inner))
        {
            var dirs = Directory.GetDirectories(extractDir);
            if (dirs.Length == 1) inner = dirs[0];
        }
        if (!File.Exists(Path.Combine(inner, "node.exe")))
        {
            throw new Exception("zip did not contain node.exe");
        }

        if (Directory.Exists(portableDir)) Directory.Delete(portableDir, true);
        Directory.Move(inner, portableDir);

        try { Directory.Delete(extractDir, true); } catch { }
        try { File.Delete(zipPath); } catch { }
    }

    static void Pause()
    {
        Console.WriteLine();
        Console.Write("  Press any key to close...");
        try { Console.ReadKey(true); } catch { }
    }
}
