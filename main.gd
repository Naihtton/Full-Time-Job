extends Node2D

@onready var player = $Player
@onready var hp_bar = $CanvasLayer/PlayerHPBar
@onready var weapon_label = $CanvasLayer/WeaponLabel

func _ready():
	hp_bar.max_value = player.max_hp
	hp_bar.value = player.hp

	player.hp_changed.connect(update_hp_bar)

func _process(_delta):
	if not is_instance_valid(player):
		weapon_label.text = "YOU DIED"
		return

	weapon_label.text = player.current_weapon["name"]

func update_hp_bar(current_hp, max_hp):
	hp_bar.max_value = max_hp
	hp_bar.value = current_hp
