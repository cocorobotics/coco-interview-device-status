[Trait("Category", "e2e")]
public class AvailabilityE2ETests : IAsyncLifetime
{
    public Task InitializeAsync() => E2EStack.IsolateTest();

    public Task DisposeAsync() => E2EStack.ResumeTraffic();

    [Fact(DisplayName = "given a robot online with nothing blocking it, when Fleet publishes that change, then HangryHippo shows it available")]
    public async Task OnlineRobotWithNothingBlockingIsAvailable()
    {
        E2EStack.PublishChange("C10393", "ONLINE", []);

        Assert.True(await E2EStack.AvailabilityOnceWritten("veh_8f21c4"));
    }
}
