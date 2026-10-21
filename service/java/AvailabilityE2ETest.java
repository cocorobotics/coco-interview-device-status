import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
    @DisplayName("given a robot online with nothing blocking it, when Fleet publishes that change, then HangryHippo shows it available")
    void onlineRobotWithNothingBlockingIsAvailable() throws Exception {
        E2EStack.publishChange("C10393", "ONLINE", List.of());

        assertEquals(Boolean.TRUE, E2EStack.availabilityOnceWritten("veh_8f21c4", 20_000));
    }
}
