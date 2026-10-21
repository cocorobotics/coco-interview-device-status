from stack import get_availability, publish_change


def test_given_a_robot_online_with_nothing_blocking_it_when_fleet_publishes_that_change_then_the_test_can_read_hangry_hippos_availability_for_it(isolated):
    publish_change("C10393", "ONLINE", [])

    print("veh_8f21c4 available:", get_availability("veh_8f21c4"))
