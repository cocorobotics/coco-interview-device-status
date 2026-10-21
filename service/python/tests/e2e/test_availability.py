from stack import availability_once_written, publish_change


def test_given_a_robot_online_with_nothing_blocking_it_when_fleet_publishes_that_change_then_hangry_hippo_shows_it_available(isolated):
    publish_change("C10393", "ONLINE", [])

    assert availability_once_written("veh_8f21c4") is True
