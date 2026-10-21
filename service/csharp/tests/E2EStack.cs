using System.Text;
using System.Text.Json;
using RabbitMQ.Client;

// The e2e tests share one queue and one HangryHippo, so no two may run at once.
[assembly: CollectionBehavior(DisableTestParallelization = true)]

static class E2EStack
{
    public static async Task IsolateTest()
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

    public static async Task ResumeTraffic() => await Http.Post($"{Config.FleetUrl}/v1/_debug/traffic", new { enabled = true });

    public static void PublishChange(string serial, string status, string[] limitingFactors)
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

    // Null when HangryHippo has recorded nothing for the vehicle within the timeout.
    public static async Task<bool?> AvailabilityOnceWritten(string vehicleId, int timeoutMs = 20_000)
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
}
