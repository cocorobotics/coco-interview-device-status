[Trait("Category", "e2e")]
public class AvailabilityE2ETests : IAsyncLifetime
{
    public Task InitializeAsync() => E2EStack.IsolateTest();

    public Task DisposeAsync() => E2EStack.ResumeTraffic();

    [Fact(DisplayName = "given a robot online with nothing blocking it, when Fleet publishes that change, then the publish succeeds")]
    public void OnlineRobotWithNothingBlockingIsPublished()
    {
        E2EStack.PublishChange("C10393", "ONLINE", []);
    }
}
