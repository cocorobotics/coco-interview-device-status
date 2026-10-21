using Xunit.Abstractions;

[Trait("Category", "e2e")]
public class AvailabilityE2ETests(ITestOutputHelper output) : IAsyncLifetime
{
    public Task InitializeAsync() => E2EStack.IsolateTest();

    public Task DisposeAsync() => E2EStack.ResumeTraffic();

    [Fact(DisplayName = "given a robot online with nothing blocking it, when Fleet publishes that change, then the test can read HangryHippo's availability for it")]
    public async Task OnlineRobotWithNothingBlockingCanBeRead()
    {
        E2EStack.PublishChange("C10393", "ONLINE", []);

        output.WriteLine($"veh_8f21c4 available: {await E2EStack.GetAvailability("veh_8f21c4")}");
    }
}
