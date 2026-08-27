// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;

internal static class MaerPasswordVaultNativeHostShim
{
    private const int MaximumFrameBytes = 65536;
    private const int ChildShutdownTimeoutMilliseconds = 5000;
    private const int ElectronPrefaceTimeoutMilliseconds = 5000;
    private const int TransportConnectTimeoutMilliseconds = 5000;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetNamedPipeClientProcessId(
        IntPtr pipe,
        out uint clientProcessId);

    private static int Main(string[] args)
    {
        Process child = null;
        NamedPipeServerStream inputPipe = null;
        NamedPipeServerStream outputPipe = null;
        try
        {
            string ownDirectory = AppDomain.CurrentDomain.BaseDirectory;
            string electronPath = Path.GetFullPath(
                Path.Combine(ownDirectory, "..", "..", "MAER Chat.exe"));
            if (!File.Exists(electronPath))
            {
                return 1;
            }

            string transportToken = CreateTransportToken();
            PipeSecurity pipeSecurity = CreateCurrentUserPipeSecurity();
            inputPipe = CreateTransportPipe(
                "maer-chat-native-in-" + transportToken,
                pipeSecurity);
            outputPipe = CreateTransportPipe(
                "maer-chat-native-out-" + transportToken,
                pipeSecurity);

            List<string> childArguments = new List<string>(args);
            childArguments.Add("--maer-native-transport=" + transportToken);
            ProcessStartInfo start = new ProcessStartInfo();
            start.FileName = electronPath;
            start.Arguments = JoinArguments(childArguments);
            start.WorkingDirectory = Path.GetDirectoryName(electronPath);
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.RedirectStandardInput = true;
            start.RedirectStandardOutput = true;
            start.RedirectStandardError = true;

            child = Process.Start(start);
            if (child == null)
            {
                return 1;
            }

            Process activeChild = child;
            Thread stderrDrain = new Thread(delegate()
            {
                try
                {
                    activeChild.StandardError.BaseStream.CopyTo(Stream.Null);
                }
                catch
                {
                    // Diagnostics never cross into the Native Messaging stream.
                }
            });
            stderrDrain.IsBackground = true;
            stderrDrain.Start();

            Stream childOutput = child.StandardOutput.BaseStream;
            byte[] electronPreface = ReadElectronPreface(
                childOutput,
                ElectronPrefaceTimeoutMilliseconds);
            if (electronPreface == null ||
                electronPreface[0] != 13 ||
                electronPreface[1] != 10)
            {
                TryKill(child);
                return 1;
            }
            Thread unexpectedStdoutGuard = new Thread(delegate()
            {
                try
                {
                    if (childOutput.ReadByte() != -1)
                    {
                        TryKill(activeChild);
                    }
                }
                catch
                {
                    // Closing the child tears down its stdout handle.
                }
            });
            unexpectedStdoutGuard.IsBackground = true;
            unexpectedStdoutGuard.Start();

            if (!WaitForVerifiedChild(inputPipe, child, TransportConnectTimeoutMilliseconds))
            {
                TryKill(child);
                return 1;
            }
            if (!WaitForVerifiedChild(outputPipe, child, TransportConnectTimeoutMilliseconds))
            {
                TryKill(child);
                return 1;
            }

            NamedPipeServerStream activeInputPipe = inputPipe;
            Thread inputRelay = new Thread(delegate()
            {
                bool valid = false;
                try
                {
                    RelayFrames(Console.OpenStandardInput(), activeInputPipe);
                    valid = true;
                    try { WriteEndMarker(activeInputPipe); } catch { }
                    try { activeInputPipe.WaitForPipeDrain(); } catch { }
                }
                catch
                {
                    // Invalid browser framing terminates the child fail-closed.
                }
                finally
                {
                    try { activeInputPipe.Dispose(); } catch { }
                    if (!valid)
                    {
                        TryKill(activeChild);
                    }
                    else if (!activeChild.WaitForExit(ChildShutdownTimeoutMilliseconds))
                    {
                        TryKill(activeChild);
                    }
                }
            });
            inputRelay.IsBackground = true;
            inputRelay.Start();

            RelayFrames(outputPipe, Console.OpenStandardOutput());
            if (!child.WaitForExit(ChildShutdownTimeoutMilliseconds))
            {
                TryKill(child);
                return 1;
            }
            return child.ExitCode;
        }
        catch
        {
            TryKill(child);
            return 1;
        }
        finally
        {
            if (inputPipe != null)
            {
                inputPipe.Dispose();
            }
            if (outputPipe != null)
            {
                outputPipe.Dispose();
            }
            if (child != null)
            {
                child.Dispose();
            }
        }
    }

    private static string CreateTransportToken()
    {
        byte[] bytes = new byte[16];
        try
        {
            using (RNGCryptoServiceProvider random = new RNGCryptoServiceProvider())
            {
                random.GetBytes(bytes);
            }
            StringBuilder result = new StringBuilder(bytes.Length * 2);
            foreach (byte value in bytes)
            {
                result.Append(value.ToString("x2"));
            }
            return result.ToString();
        }
        finally
        {
            Array.Clear(bytes, 0, bytes.Length);
        }
    }

    private static PipeSecurity CreateCurrentUserPipeSecurity()
    {
        SecurityIdentifier user = WindowsIdentity.GetCurrent().User;
        if (user == null)
        {
            throw new InvalidOperationException();
        }
        PipeSecurity security = new PipeSecurity();
        security.SetAccessRuleProtection(true, false);
        security.SetOwner(user);
        security.AddAccessRule(new PipeAccessRule(
            user,
            PipeAccessRights.FullControl,
            AccessControlType.Allow));
        return security;
    }

    private static NamedPipeServerStream CreateTransportPipe(
        string name,
        PipeSecurity security)
    {
        return new NamedPipeServerStream(
            name,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous | PipeOptions.WriteThrough,
            MaximumFrameBytes + 4,
            MaximumFrameBytes + 4,
            security);
    }

    private static bool WaitForVerifiedChild(
        NamedPipeServerStream pipe,
        Process child,
        int timeoutMilliseconds)
    {
        IAsyncResult pending = pipe.BeginWaitForConnection(null, null);
        try
        {
            if (!pending.AsyncWaitHandle.WaitOne(timeoutMilliseconds))
            {
                return false;
            }
            pipe.EndWaitForConnection(pending);
            uint clientProcessId;
            return GetNamedPipeClientProcessId(
                pipe.SafePipeHandle.DangerousGetHandle(),
                out clientProcessId) &&
                clientProcessId == (uint)child.Id;
        }
        finally
        {
            pending.AsyncWaitHandle.Close();
        }
    }

    private static byte[] ReadElectronPreface(Stream input, int timeoutMilliseconds)
    {
        byte[] preface = new byte[2];
        int bytesRead = 0;
        Exception readError = null;
        Thread reader = new Thread(delegate()
        {
            try
            {
                bytesRead = ReadExact(input, preface, 0, preface.Length, false);
            }
            catch (Exception error)
            {
                readError = error;
            }
        });
        reader.IsBackground = true;
        reader.Start();
        if (!reader.Join(timeoutMilliseconds))
        {
            return null;
        }
        if (readError != null || bytesRead != preface.Length)
        {
            return null;
        }
        return preface;
    }

    private static void RelayFrames(Stream input, Stream output)
    {
        byte[] header = new byte[4];
        while (true)
        {
            int headerBytes = ReadExact(input, header, 0, header.Length, true);
            if (headerBytes == 0)
            {
                return;
            }
            if (headerBytes != header.Length)
            {
                throw new InvalidDataException();
            }

            uint length = (uint)(
                header[0] |
                (header[1] << 8) |
                (header[2] << 16) |
                (header[3] << 24));
            if (length == 0 || length > MaximumFrameBytes)
            {
                throw new InvalidDataException();
            }

            byte[] payload = new byte[(int)length];
            try
            {
                if (ReadExact(input, payload, 0, payload.Length, false) != payload.Length)
                {
                    throw new EndOfStreamException();
                }
                output.Write(header, 0, header.Length);
                output.Write(payload, 0, payload.Length);
                output.Flush();
            }
            finally
            {
                Array.Clear(payload, 0, payload.Length);
            }
        }
    }

    private static void WriteEndMarker(Stream output)
    {
        byte[] marker = new byte[4];
        output.Write(marker, 0, marker.Length);
        output.Flush();
    }

    private static int ReadExact(
        Stream input,
        byte[] buffer,
        int offset,
        int count,
        bool allowCleanEnd)
    {
        int total = 0;
        while (total < count)
        {
            int read;
            try
            {
                read = input.Read(buffer, offset + total, count - total);
            }
            catch (IOException)
            {
                if (total == 0 && allowCleanEnd)
                {
                    return 0;
                }
                throw;
            }
            if (read == 0)
            {
                if (total == 0 && allowCleanEnd)
                {
                    return 0;
                }
                break;
            }
            total += read;
        }
        return total;
    }

    private static string JoinArguments(IEnumerable<string> arguments)
    {
        StringBuilder result = new StringBuilder();
        foreach (string argument in arguments)
        {
            if (result.Length > 0)
            {
                result.Append(' ');
            }
            result.Append(QuoteArgument(argument ?? string.Empty));
        }
        return result.ToString();
    }

    private static string QuoteArgument(string value)
    {
        if (value.Length > 0 && value.IndexOfAny(new char[] { ' ', '\t', '\n', '\v', '"' }) < 0)
        {
            return value;
        }

        StringBuilder result = new StringBuilder();
        result.Append('"');
        int backslashes = 0;
        foreach (char character in value)
        {
            if (character == '\\')
            {
                backslashes += 1;
                continue;
            }
            if (character == '"')
            {
                result.Append('\\', backslashes * 2 + 1);
                result.Append('"');
                backslashes = 0;
                continue;
            }
            result.Append('\\', backslashes);
            backslashes = 0;
            result.Append(character);
        }
        result.Append('\\', backslashes * 2);
        result.Append('"');
        return result.ToString();
    }

    private static void TryKill(Process process)
    {
        if (process == null)
        {
            return;
        }
        try
        {
            if (!process.HasExited)
            {
                process.Kill();
            }
        }
        catch
        {
            // The process is already gone or inaccessible.
        }
    }
}
