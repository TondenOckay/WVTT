using SETUE.Core;

namespace SETUE
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("=== Engine Starting ===");
            
            MasterClock.Load();
            MasterClock.Start();
            
            // Wait for the scheduler thread to exit (e.g., when the window closes)
            MasterClock.WaitForExit();
            
            Console.WriteLine("=== Engine Shutdown ===");
        }
    }
}
