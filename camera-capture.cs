@"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX.Direct3D11;
using Windows.Media.Core;
using Windows.Storage.Streams;

public class CameraCapture {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    
    const int SW_RESTORE = 9;
    const int SW_SHOW = 5;
    const int SW_MINIMIZE = 6;
    
    public static bool Capture(string outputPath) {
        var proc = System.Diagnostics.Process.GetProcessesByName("iCam365");
        if (proc.Length == 0) return false;
        var hWnd = proc[0].MainWindowHandle;
        
        // Try to restore window
        ShowWindow(hWnd, SW_RESTORE);
        System.Threading.Thread.Sleep(500);
        SetForegroundWindow(hWnd);
        System.Threading.Thread.Sleep(500);
        
        RECT rect;
        GetWindowRect(hWnd, out rect);
        int w = rect.Right - rect.Left;
        int h = rect.Bottom - rect.Top;
        if (w <= 0 || h <= 0) { w = 640; h = 480; }
        
        using (var bmp = new Bitmap(w, h)) {
            using (var g = Graphics.FromImage(bmp)) {
                g.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(w, h));
            }
            bmp.Save(outputPath, ImageFormat.Jpeg);
        }
        
        // Minimize again
        ShowWindow(hWnd, SW_MINIMIZE);
        return true;
    }
}
"@