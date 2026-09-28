using System.Text;
using System.Text.Json;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

var channel = Amqp.Connect(Config.AmqpUrl);
channel.BasicQos(0, 1, false);

var consumer = new EventingBasicConsumer(channel);
consumer.Received += (_, delivery) =>
{
    try
    {
        Handler.HandleStatusChange(delivery);
        channel.BasicAck(delivery.DeliveryTag, false);
    }
    catch (Exception e)
    {
        Console.Error.WriteLine($"message {delivery.BasicProperties.MessageId} failed: {e}");
        channel.BasicNack(delivery.DeliveryTag, false, false);
    }
};

Console.WriteLine($"consuming {Config.Queue}");
channel.BasicConsume(Config.Queue, false, consumer);
Thread.Sleep(Timeout.Infinite);

static class Config
{
    public static readonly string AmqpUrl = Environment.GetEnvironmentVariable("AMQP_URL") ?? "amqp://guest:guest@localhost:5672/";
    public static readonly string Queue = Environment.GetEnvironmentVariable("QUEUE") ?? "device-status";
    public static readonly string FleetUrl = Environment.GetEnvironmentVariable("FLEET_URL") ?? "http://localhost:4001";
    public static readonly string PartnerUrl = Environment.GetEnvironmentVariable("PARTNER_URL") ?? "http://localhost:4002";
}

static class Handler
{
    public static void HandleStatusChange(BasicDeliverEventArgs delivery)
    {
        var change = JsonSerializer.Deserialize<StatusChange>(delivery.Body.Span, Http.JsonOptions)!;

        Console.WriteLine(
            $"change={delivery.BasicProperties.MessageId} serial={change.Serial} status={change.Status} " +
            $"factors={string.Join(",", change.LimitingFactors)} redelivered={delivery.Redelivered}");

        // TODO: the steps in the README go here.
    }
}

record StatusChange(string Serial, string Status, string[] LimitingFactors, string ObservedAt);

// --- plumbing, nothing below here is part of the exercise ---

static class Amqp
{
    public static IModel Connect(string url)
    {
        var factory = new ConnectionFactory { Uri = new Uri(url) };
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return factory.CreateConnection().CreateModel();
            }
            catch when (attempt < 30)
            {
                Thread.Sleep(1000);
            }
        }
    }
}

record Response(int Status, JsonElement? Body);

static class Http
{
    const int DefaultTimeoutMs = 3000;

    // Web defaults match the camelCase the services speak.
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    static readonly HttpClient Client = new() { Timeout = Timeout.InfiniteTimeSpan };

    public static Task<Response> Get(string url, int timeoutMs = DefaultTimeoutMs) => Call(HttpMethod.Get, url, null, timeoutMs);

    public static Task<Response> Put(string url, object body, int timeoutMs = DefaultTimeoutMs) => Call(HttpMethod.Put, url, body, timeoutMs);

    public static Task<Response> Post(string url, object body, int timeoutMs = DefaultTimeoutMs) => Call(HttpMethod.Post, url, body, timeoutMs);

    static async Task<Response> Call(HttpMethod method, string url, object? body, int timeoutMs)
    {
        using var request = new HttpRequestMessage(method, url);
        if (body is not null)
        {
            request.Content = new StringContent(JsonSerializer.Serialize(body, JsonOptions), Encoding.UTF8, "application/json");
        }

        using var cts = new CancellationTokenSource(timeoutMs);
        using var res = await Client.SendAsync(request, cts.Token);
        var text = await res.Content.ReadAsStringAsync();

        return new Response((int)res.StatusCode, string.IsNullOrWhiteSpace(text) ? null : JsonDocument.Parse(text).RootElement.Clone());
    }
}
