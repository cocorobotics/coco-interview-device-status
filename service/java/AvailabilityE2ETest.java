import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.List;

@Tag("e2e")
class AvailabilityE2ETest {

    @BeforeEach
    void isolateTest() throws Exception {
        E2EStack.isolateTest();
    }

    @AfterEach
    void resumeTraffic() throws Exception {
        E2EStack.resumeTraffic();
    }

    @Test
    @DisplayName("given a robot online with nothing blocking it, when Fleet publishes that change, then the test can read HangryHippo's availability for it")
    void onlineRobotWithNothingBlockingCanBeRead() throws Exception {
        E2EStack.publishChange("C10393", "ONLINE", List.of());

        System.out.println("veh_8f21c4 available: " + E2EStack.getAvailability("veh_8f21c4"));
    }
}
