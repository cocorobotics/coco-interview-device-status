using System.Text;
using System.Text.Json;
using RabbitMQ.Client;

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
        // Lets a change your consumer already had in flight land before DeliverMe is cleared.
        await Task.Delay(2000);
        await Http.Post($"{Config.PartnerUrl}/v1/_debug/reset", new { });
    }

    public async Task DisposeAsync() => await Http.Post($"{Config.FleetUrl}/v1/_debug/traffic", new { enabled = true });

    static void PublishChange(string serial, string status, string[] limitingFactors)
    {
        var change = new StatusChange(serial, status, limitingFactors, DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));
        using var channel = Amqp.Connect(Config.AmqpUrl);
        channel.ConfirmSelect();
        var properties = channel.CreateBasicProperties();
        properties.MessageId = $"chg_e2e_{Guid.NewGuid():N}"[..20];
        properties.ContentType = "application/json";
        channel.BasicPublish("fleet", "device.status.changed", properties, Encoding.UTF8.GetBytes(JsonSerializer.Serialize(change, Http.JsonOptions)));
        channel.WaitForConfirmsOrDie(TimeSpan.FromSeconds(5));
    }

    // Null when DeliverMe has recorded nothing for the vehicle within the timeout.
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

    [Fact(DisplayName = "given a robot online with nothing blocking it, when the fleet publishes that change, then DeliverMe shows it available")]
    public async Task OnlineRobotWithNothingBlockingIsAvailable()
    {
        PublishChange("C10393", "ONLINE", []);

        Assert.True(await AvailabilityOnceWritten("veh_8f21c4"));
    }
}
