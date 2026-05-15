extends Node

@export var zombie_scene: PackedScene

var wave := 1
var spawn_interval := 2.0
var side = randi() % 4
var pos = Vector2.ZERO

func _ready():
	start_wave_loop()

func start_wave_loop():

	while true:

		print("Wave:", wave)

		for i in range(wave * 5):
			spawn_zombie()

			await get_tree().create_timer(0.3).timeout

		wave += 1

		spawn_interval *= 0.9

		await get_tree().create_timer(5.0).timeout

func spawn_zombie():

	var zombie = zombie_scene.instantiate()

	get_parent().add_child(zombie)

	match side:
		0: pos = Vector2(randf_range(-200, 1200), -100)
		1: pos = Vector2(randf_range(-200, 1200), 900)
		2: pos = Vector2(-100, randf_range(-200, 900))
		3: pos = Vector2(1300, randf_range(-200, 900))

	zombie.global_position = pos
