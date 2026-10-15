using System.Text.Json;

[Trait("Category", "e2e")]
public class AvailabilityE2ETests : IAsyncLifetime
{
    public async Task InitializeAsync()
    {
        await Http.Post($"{Config.FleetUrl}/v1/_debug/traffic", new { enabled = false });
        using (var channel = Amqp.Connect(Config.AmqpUrl))
        {
            channel.QueuePurge(Config.Queue);
        }
        // Lets a change your consumer already had in flight land before HangryHippo is cleared.
        await Task.Delay(2000);
        await Http.Post($"{Config.PartnerUrl}/v1/_debug/reset", new { });
    }

    public async Task DisposeAsync() => await Http.Post($"{Config.FleetUrl}/v1/_debug/traffic", new { enabled = true });

    static async Task PublishChange(string serial, string status, string[] limitingFactors)
    {
        var res = await Http.Post($"{Config.FleetUrl}/v1/_debug/changes", new { serial, status, limitingFactors });
        Assert.True(res.Status == 200, $"fleet did not publish the change: {res.Status} {res.Body}");
    }

    static async Task<List<JsonElement>> HangryHippoCalls(string vehicleId)
    {
        var res = await Http.Get($"{Config.PartnerUrl}/v1/_debug/calls");
        return res.Body?.GetProperty("calls").EnumerateArray()
            .Where(call => call.GetProperty("vehicleId").GetString() == vehicleId)
            .ToList() ?? [];
    }

    // Null when HangryHippo has recorded nothing for the vehicle within the timeout.
    static async Task<bool?> AvailabilityOnceWritten(string vehicleId, int timeoutMs = 20_000)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTime.UtcNow < deadline)
        {
            var res = await Http.Get($"{Config.PartnerUrl}/v1/vehicles/{vehicleId}/availability");
            if (res.Status == 200)
            {
                return res.Body?.GetProperty("available").GetBoolean();
            }
            await Task.Delay(250);
        }
        return null;
    }

    [Fact(DisplayName = "given a robot online with nothing blocking it, when the fleet publishes that change, then HangryHippo shows it available")]
    public async Task OnlineRobotWithNothingBlockingIsAvailable()
    {
        await PublishChange("C10393", "ONLINE", []);

        Assert.True(await AvailabilityOnceWritten("veh_8f21c4"));
    }
}
