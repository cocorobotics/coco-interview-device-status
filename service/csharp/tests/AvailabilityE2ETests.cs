[Trait("Category", "e2e")]
public class AvailabilityE2ETests : IAsyncLifetime
{
    public Task InitializeAsync() => E2EHelpers.IsolateTest();

    public Task DisposeAsync() => E2EHelpers.ResumeTraffic();

    [Fact(DisplayName = "given a robot online with nothing blocking it, when Fleet publishes that change, then the publish succeeds")]
    public void OnlineRobotWithNothingBlockingIsPublished()
    {
        E2EHelpers.PublishChange("C10393", "ONLINE", []);
    }
}
