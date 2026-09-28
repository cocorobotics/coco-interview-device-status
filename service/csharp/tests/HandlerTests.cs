using System.Reflection;
using System.Text;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

public class HandlerTests
{
    // The client exposes message properties only as an interface, so this fakes the one the handler reads.
    public class FakeProperties : DispatchProxy
    {
        protected override object? Invoke(MethodInfo? method, object?[]? args) =>
            method?.Name == "get_MessageId" ? "chg_test" : null;
    }

    static BasicDeliverEventArgs Delivery(string body) =>
        new("test", 1, false, "fleet", "device.status.changed", DispatchProxy.Create<IBasicProperties, FakeProperties>(), Encoding.UTF8.GetBytes(body));

    [Fact(DisplayName = "given a well-formed status change, when it is handled, then it is accepted")]
    public void WellFormedChangeIsAccepted()
    {
        var delivery = Delivery("""{"serial":"C10393","status":"ONLINE","limitingFactors":[],"observedAt":"2026-09-24T17:02:11.482Z"}""");

        var error = Record.Exception(() => Handler.HandleStatusChange(delivery));

        Assert.Null(error);
    }
}
