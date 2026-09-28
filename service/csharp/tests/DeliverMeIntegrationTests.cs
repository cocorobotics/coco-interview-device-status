[Trait("Category", "integration")]
public class DeliverMeIntegrationTests
{
    [Fact(DisplayName = "given a robot registered with DeliverMe, when its serial is looked up, then DeliverMe returns its vehicle id")]
    public async Task RegisteredSerialMapsToVehicleId()
    {
        var res = await Http.Get($"{Config.PartnerUrl}/v1/vehicles?serial=C10393");

        Assert.Equal(200, res.Status);
        Assert.Equal("veh_8f21c4", res.Body?.GetProperty("vehicleId").GetString());
    }
}
